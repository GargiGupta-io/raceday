import assert from "node:assert/strict";
import test from "node:test";

import {
  LiveConnectionController,
  LiveConnectionScheduler,
  LiveConnectionSource,
  LiveSocket,
  LiveTransportStatus,
} from "../app/lib/live-connection";

interface ScheduledTask {
  callback: () => void;
  delayMs: number;
}

class FakeScheduler implements LiveConnectionScheduler {
  private nextId = 1;
  private readonly tasks = new Map<number, ScheduledTask>();

  setTimeout = (callback: () => void, delayMs: number) => {
    const id = this.nextId;
    this.nextId += 1;
    this.tasks.set(id, { callback, delayMs });
    return id;
  };

  clearTimeout = (handle: unknown) => {
    this.tasks.delete(handle as number);
  };

  delays() {
    return [...this.tasks.values()].map((task) => task.delayMs).sort((left, right) => left - right);
  }

  runDelay(delayMs: number) {
    const entry = [...this.tasks.entries()].find(([, task]) => task.delayMs === delayMs);
    assert.ok(entry, `Expected a ${delayMs}ms timer`);
    const [id, task] = entry;
    this.tasks.delete(id);
    task.callback();
  }

  size() {
    return this.tasks.size;
  }
}

class FakeSocket implements LiveSocket {
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;
  closeCalls = 0;

  close = () => {
    this.closeCalls += 1;
  };

  open() {
    this.onopen?.();
  }

  message(data: unknown) {
    this.onmessage?.({ data });
  }

  error() {
    this.onerror?.();
  }

  closed() {
    this.onclose?.();
  }
}

interface TestPayload {
  active: boolean;
  lap?: number;
}

function flushPromises() {
  return new Promise<void>((resolve) => setImmediate(resolve));
}

function makeHarness(poll: () => Promise<TestPayload> = async () => ({ active: false })) {
  const scheduler = new FakeScheduler();
  const sockets: FakeSocket[] = [];
  const statuses: LiveTransportStatus[] = [];
  const data: Array<{ payload: TestPayload; source: LiveConnectionSource }> = [];
  const pollErrors: unknown[] = [];
  let noMessageCalls = 0;

  const controller = new LiveConnectionController<TestPayload>({
    createSocket: () => {
      const socket = new FakeSocket();
      sockets.push(socket);
      return socket;
    },
    poll,
    parseMessage: (raw) => JSON.parse(String(raw)) as TestPayload,
    onData: (payload, source) => data.push({ payload, source }),
    onStatus: (status) => statuses.push(status),
    onNoMessage: () => {
      noMessageCalls += 1;
    },
    onPollError: (error) => pollErrors.push(error),
    random: () => 0.5,
    scheduler,
  });

  return {
    controller,
    data,
    get noMessageCalls() {
      return noMessageCalls;
    },
    pollErrors,
    scheduler,
    sockets,
    statuses,
  };
}

test("uses WebSocket data without starting REST polling", async () => {
  let pollCalls = 0;
  const harness = makeHarness(async () => {
    pollCalls += 1;
    return { active: false };
  });

  harness.controller.start();
  harness.sockets[0].open();
  harness.sockets[0].message(JSON.stringify({ active: true, lap: 12 }));
  await flushPromises();

  assert.equal(pollCalls, 0);
  assert.deepEqual(harness.data, [
    { payload: { active: true, lap: 12 }, source: "websocket" },
  ]);
  assert.equal(harness.statuses.at(-1), "connected");
  assert.deepEqual(harness.scheduler.delays(), []);
});

test("falls back to polling once and reconnects the WebSocket", async () => {
  let pollCalls = 0;
  const harness = makeHarness(async () => {
    pollCalls += 1;
    return { active: true, lap: 13 };
  });

  harness.controller.start();
  const firstSocket = harness.sockets[0];
  firstSocket.error();
  firstSocket.closed();
  await flushPromises();

  assert.equal(pollCalls, 1);
  assert.equal(firstSocket.closeCalls, 1);
  assert.deepEqual(harness.data, [
    { payload: { active: true, lap: 13 }, source: "polling" },
  ]);
  assert.deepEqual(harness.scheduler.delays(), [1_000, 10_000]);

  harness.scheduler.runDelay(1_000);
  const recoveredSocket = harness.sockets[1];
  recoveredSocket.open();
  recoveredSocket.message(JSON.stringify({ active: true, lap: 14 }));

  assert.equal(harness.sockets.length, 2);
  assert.equal(harness.statuses.at(-1), "connected");
  assert.deepEqual(harness.data.at(-1), {
    payload: { active: true, lap: 14 },
    source: "websocket",
  });
  assert.deepEqual(harness.scheduler.delays(), []);
});

test("times out a stalled WebSocket handshake instead of loading forever", async () => {
  let pollCalls = 0;
  const harness = makeHarness(async () => {
    pollCalls += 1;
    return { active: false };
  });

  harness.controller.start();
  assert.ok(harness.scheduler.delays().includes(8_000));
  harness.scheduler.runDelay(8_000);
  await flushPromises();

  assert.equal(pollCalls, 1);
  assert.equal(harness.sockets[0].closeCalls, 1);
  assert.ok(harness.scheduler.delays().includes(1_000));
});

test("ignores a stale poll response after WebSocket recovery", async () => {
  let resolvePoll: ((payload: TestPayload) => void) | undefined;
  const harness = makeHarness(
    () =>
      new Promise<TestPayload>((resolve) => {
        resolvePoll = resolve;
      }),
  );

  harness.controller.start();
  harness.sockets[0].closed();
  harness.scheduler.runDelay(1_000);
  harness.sockets[1].open();
  harness.sockets[1].message(JSON.stringify({ active: true, lap: 22 }));
  resolvePoll?.({ active: true, lap: 21 });
  await flushPromises();

  assert.deepEqual(harness.data, [
    { payload: { active: true, lap: 22 }, source: "websocket" },
  ]);
});

test("backs off repeated reconnects and resets after a valid message", async () => {
  const harness = makeHarness();

  harness.controller.start();
  harness.sockets[0].closed();
  await flushPromises();
  harness.scheduler.runDelay(1_000);

  harness.sockets[1].closed();
  assert.ok(harness.scheduler.delays().includes(2_000));
  harness.scheduler.runDelay(2_000);

  harness.sockets[2].open();
  harness.sockets[2].message(JSON.stringify({ active: true, lap: 20 }));
  harness.sockets[2].closed();

  assert.ok(harness.scheduler.delays().includes(1_000));
});

test("reports no live session when an open socket sends no message", () => {
  const harness = makeHarness();

  harness.controller.start();
  harness.sockets[0].open();
  harness.scheduler.runDelay(3_500);

  assert.equal(harness.noMessageCalls, 1);
  assert.equal(harness.statuses.at(-1), "connected");
});

test("poll failures report offline while reconnect remains scheduled", async () => {
  const failure = new Error("backend unavailable");
  const harness = makeHarness(async () => Promise.reject(failure));

  harness.controller.start();
  harness.sockets[0].closed();
  await flushPromises();

  assert.equal(harness.statuses.at(-1), "offline");
  assert.deepEqual(harness.pollErrors, [failure]);
  assert.ok(harness.scheduler.delays().includes(1_000));
  assert.ok(harness.scheduler.delays().includes(10_000));
});

test("malformed WebSocket data triggers fallback and reconnect", async () => {
  const harness = makeHarness();

  harness.controller.start();
  harness.sockets[0].open();
  harness.sockets[0].message("not json");
  await flushPromises();

  assert.equal(harness.sockets[0].closeCalls, 1);
  assert.equal(harness.data.at(-1)?.source, "polling");
  assert.ok(harness.scheduler.delays().includes(1_000));
});

test("stop clears timers and ignores stale socket callbacks", async () => {
  let pollCalls = 0;
  const harness = makeHarness(async () => {
    pollCalls += 1;
    return { active: false };
  });

  harness.controller.start();
  const socket = harness.sockets[0];
  socket.closed();
  await flushPromises();
  harness.controller.stop();
  const socketCount = harness.sockets.length;

  socket.open();
  socket.message(JSON.stringify({ active: true, lap: 30 }));

  assert.equal(harness.scheduler.size(), 0);
  assert.equal(harness.sockets.length, socketCount);
  assert.equal(pollCalls, 1);
});
