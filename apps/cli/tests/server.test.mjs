import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";

import { consumeCapture, startPageServer } from "../bin/server.mjs";

let root;
let server;
let url;
let requests;
let runtimeFails = false;

before(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "phraseweave-page-test-"));
  await fs.writeFile(path.join(root, "index.html"), "<h1>PhraseWeave</h1>");
  await fs.writeFile(path.join(root, "200.html"), "<h1>Fallback</h1>");
  requests = [];
  const runtime = {
    request: async (...args) => {
      if (runtimeFails) throw new Error("Generator exited.");
      requests.push(args);
      if (args[0] === "/api/tts") {
        return new Response(new Uint8Array([255, 251, 144, 0, 255, 0, 128]), {
          headers: { "Content-Type": "audio/mpeg" },
        });
      }
      return new Response(JSON.stringify({ runtimeReady: true }), {
        headers: { "Content-Type": "application/json" },
      });
    },
    restart: async () => {},
  };
  ({ server, url } = await startPageServer({ clientRoot: root, runtime, port: 0 }));
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await fs.rm(root, { recursive: true, force: true });
});

test("serves the generated page and client routes", async () => {
  assert.match(await (await fetch(url)).text(), /PhraseWeave/);
  assert.match(await (await fetch(new URL("/some/client/route", url))).text(), /Fallback/);
});

test("proxies generator requests from the local page", async () => {
  const response = await fetch(new URL("/api/generate", url), {
    method: "POST",
    headers: { Origin: new URL(url).origin, "Content-Type": "application/json" },
    body: JSON.stringify({ text: "Example" }),
  });
  assert.equal(response.status, 200);
  assert.deepEqual(requests.at(-1), ["/api/generate", "POST", '{"text":"Example"}']);
});

test("preserves binary word audio and accepts cache deletion", async () => {
  const headers = { Origin: new URL(url).origin, "Content-Type": "application/json" };
  const response = await fetch(new URL("/api/tts", url), {
    method: "POST",
    headers,
    body: JSON.stringify({ text: "hello" }),
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Content-Type"), "audio/mpeg");
  assert.deepEqual(
    [...new Uint8Array(await response.arrayBuffer())],
    [255, 251, 144, 0, 255, 0, 128],
  );
  assert.deepEqual(requests.at(-1), ["/api/tts", "POST", '{"text":"hello"}']);
  const clear = await fetch(new URL("/api/tts/cache", url), { method: "DELETE", headers });
  assert.equal(clear.status, 200);
  assert.deepEqual(requests.at(-1), ["/api/tts/cache", "DELETE", undefined]);
  const rejected = await fetch(new URL("/api/tts", url), {
    method: "POST",
    headers: { Origin: "https://example.com" },
    body: "{}",
  });
  assert.equal(rejected.status, 403);
});

test("proxies sentence audio with its kind and full source text", async () => {
  const payload = JSON.stringify({ text: "I use a computer every day.", kind: "sentence" });
  const response = await fetch(new URL("/api/tts", url), {
    method: "POST",
    headers: { Origin: new URL(url).origin, "Content-Type": "application/json" },
    body: payload,
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Content-Type"), "audio/mpeg");
  assert.deepEqual(requests.at(-1), ["/api/tts", "POST", payload]);
});

test("rejects cross-origin mutation and DNS rebinding hosts", async () => {
  const api = new URL("/api/generate", url);
  const crossOrigin = await fetch(api, {
    method: "POST",
    headers: { Origin: "https://example.com" },
    body: "{}",
  });
  assert.equal(crossOrigin.status, 403);
  const reboundStatus = await new Promise((resolve, reject) => {
    http
      .get(api, { headers: { Host: "example.com" } }, (response) => {
        response.resume();
        resolve(response.statusCode);
      })
      .on("error", reject);
  });
  assert.equal(reboundStatus, 403);
});

test("accepts only the configured remote origin for API mutations", async () => {
  const remote = await startPageServer({
    clientRoot: root,
    runtime: {
      request: async () => new Response(JSON.stringify({ ok: true })),
    },
    port: 0,
    remoteOrigin: "https://phraseweave.example.com",
  });
  try {
    const api = new URL("/api/generate", remote.url);
    const allowed = await fetch(api, {
      method: "POST",
      headers: { Origin: "https://phraseweave.example.com" },
      body: "{}",
    });
    assert.equal(allowed.status, 200);
    const rejected = await fetch(api, {
      method: "POST",
      headers: { Origin: "https://other.example.com" },
      body: "{}",
    });
    assert.equal(rejected.status, 403);
  } finally {
    await new Promise((resolve) => remote.server.close(resolve));
  }
});

test("refuses an occupied page port instead of switching ports", async () => {
  const occupied = http.createServer((_request, response) => response.end("other app"));
  await new Promise((resolve) => occupied.listen(0, "127.0.0.1", resolve));
  const preferred = occupied.address().port;
  try {
    await assert.rejects(
      startPageServer({ clientRoot: root, runtime: {}, port: preferred }),
      /已被占用/,
    );
    assert.equal(await (await fetch(`http://127.0.0.1:${preferred}/`)).text(), "other app");
  } finally {
    await new Promise((resolve) => occupied.close(resolve));
  }
});

test("reports a stopped generator so the page can offer retry", async () => {
  runtimeFails = true;
  try {
    const response = await fetch(new URL("/api/status", url));
    assert.equal(response.status, 200);
    assert.deepEqual((await response.json()).initialization, {
      state: "error",
      message: "生成引擎已停止",
      error: "Generator exited.",
    });
  } finally {
    runtimeFails = false;
  }
});

test("consumes a native-host capture exactly once", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "phraseweave-capture-test-"));
  const id = "0123456789abcdef0123456789abcdef";
  try {
    await fs.writeFile(
      path.join(directory, `${id}.json`),
      JSON.stringify({ text: "The cat sleeps." }),
    );
    assert.equal(await consumeCapture(id, directory), "The cat sleeps.");
    await assert.rejects(consumeCapture(id, directory), { code: "ENOENT" });
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("proxies TTS preparation and protects retry mutations", async () => {
  assert.equal((await fetch(new URL("/api/tts/status", url))).status, 200);
  assert.deepEqual(requests.at(-1), ["/api/tts/status", "GET", undefined]);
  const headers = { Origin: new URL(url).origin };
  assert.equal(
    (await fetch(new URL("/api/tts/retry", url), { method: "POST", headers })).status,
    200,
  );
  assert.deepEqual(requests.at(-1), ["/api/tts/retry", "POST", ""]);
  assert.equal(
    (
      await fetch(new URL("/api/tts/retry", url), {
        method: "POST",
        headers: { Origin: "https://evil.example" },
      })
    ).status,
    403,
  );
});
