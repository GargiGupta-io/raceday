import assert from "node:assert/strict";
import test, { afterEach } from "node:test";

import { fetchWithTimeout, isEmptyResponse, wsUrl } from "../app/lib/api";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("wsUrl converts REST host to WebSocket host", () => {
  assert.equal(wsUrl("/ws/live"), "ws://localhost:8888/ws/live");
});

test("empty response helper treats no live session as a valid response", () => {
  assert.equal(isEmptyResponse(null), true);
  assert.equal(isEmptyResponse([]), true);
  assert.equal(isEmptyResponse({ active: false, session: null }), false);
});

test("fetchWithTimeout reports success for no live session state", async () => {
  const states: string[] = [];
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ active: false, session: null }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });

  const data = await fetchWithTimeout<{ active: boolean; session: string | null }>(
    "http://localhost:8888/live",
    {
      timeoutMs: 200,
      retries: 0,
      slowMs: 1000,
      onState: (state) => states.push(state),
    },
  );

  assert.deepEqual(data, { active: false, session: null });
  assert.deepEqual(states, ["loading", "success"]);
});

test("fetchWithTimeout reports error after failed backend response", async () => {
  const states: string[] = [];
  globalThis.fetch = async () => new Response("Service unavailable", { status: 503 });

  await assert.rejects(
    fetchWithTimeout("http://localhost:8888/races/2026", {
      timeoutMs: 200,
      retries: 0,
      slowMs: 1000,
      onState: (state) => states.push(state),
    }),
  );

  assert.deepEqual(states, ["loading", "error"]);
});

test("fetchWithTimeout retries once after a temporary backend failure", async () => {
  const states: string[] = [];
  let attempts = 0;

  globalThis.fetch = async () => {
    attempts += 1;
    if (attempts === 1) {
      return new Response("Service unavailable", { status: 503 });
    }

    return new Response(JSON.stringify([{ year: 2026, track: "Canadian Grand Prix" }]), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  const data = await fetchWithTimeout<Array<{ year: number; track: string }>>(
    "http://localhost:8888/races/2026",
    {
      timeoutMs: 200,
      retries: 1,
      slowMs: 1000,
      onState: (state) => states.push(state),
    },
  );

  assert.equal(attempts, 2);
  assert.deepEqual(data, [{ year: 2026, track: "Canadian Grand Prix" }]);
  assert.deepEqual(states, ["loading", "retrying", "success"]);
});

test("fetchWithTimeout aborts a request that exceeds its time budget", async () => {
  const states: string[] = [];

  globalThis.fetch = async (_input, init) =>
    new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => {
        reject(new DOMException("Request timed out", "AbortError"));
      });
    });

  await assert.rejects(
    fetchWithTimeout("http://localhost:8888/live", {
      timeoutMs: 10,
      retries: 0,
      slowMs: 1000,
      onState: (state) => states.push(state),
    }),
    { name: "AbortError" },
  );

  assert.deepEqual(states, ["loading", "error"]);
});
