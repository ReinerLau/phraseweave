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
