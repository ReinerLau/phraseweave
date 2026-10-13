import assert from "node:assert/strict";
import { test } from "node:test";

import { GeneratorRuntime } from "../bin/runtime.mjs";

test("allows the complete sentence generation deadline through the runtime proxy", async (t) => {
  const deadlines = [];
  t.mock.method(AbortSignal, "timeout", (milliseconds) => {
    deadlines.push(milliseconds);
    return new AbortController().signal;
  });
  // Node 20.12 exposes fetch through a lazy getter; initialize it before mocking.
  assert.equal(typeof globalThis.fetch, "function");
  t.mock.method(globalThis, "fetch", async () => new Response("audio"));
  const runtime = new GeneratorRuntime("unused");
  runtime.port = 8765;
  runtime.token = "test-only";
  await runtime.request("/api/tts", "POST", '{"text":"Hello.","kind":"sentence"}');
  await runtime.request("/api/tts/status");
  assert.ok(deadlines[0] > 60_000);
  assert.equal(deadlines[1], 30_000);
});
