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
