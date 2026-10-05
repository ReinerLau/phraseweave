import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { installExtension, NATIVE_HOST } from "../bin/extension.mjs";
import { captureToWeb, encodeNativeMessage, readNativeMessage } from "../bin/native-host.mjs";
import { consumeCapture } from "../bin/server.mjs";

const selection = { type: "capture", text: "The cat sleeps. 中文" };

async function withService(t, record, run) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "pw-native-"));
  const sockets = new Set();
  const server = net.createServer((socket) => {
    sockets.add(socket);
    socket.once("close", () => sockets.delete(socket));
    if (record) socket.write(`${JSON.stringify(record)}\n`);
  });
  await new Promise((resolve) => server.listen(path.join(directory, "service.sock"), resolve));
  t.after(async () => {
    for (const socket of sockets) socket.destroy();
    await new Promise((resolve) => server.close(resolve));
    await fs.rm(directory, { recursive: true, force: true });
  });
  return run(directory);
}

test("native framing accepts split headers and UTF-8 bodies", async () => {
  const bytes = encodeNativeMessage(selection);
  assert.deepEqual(
    await readNativeMessage(
      Readable.from([
        bytes.subarray(0, 1),
        bytes.subarray(1, 3),
        bytes.subarray(3, 7),
        bytes.subarray(7),
      ]),
    ),
    selection,
  );
});

test("native framing rejects oversized, truncated and malformed messages", async () => {
  const header = Buffer.alloc(4);
  header.writeUInt32LE(300_001);
  await assert.rejects(readNativeMessage(Readable.from([header])), /长度/);
  await assert.rejects(readNativeMessage(Readable.from([Buffer.from([1, 0])])), /不完整/);
  await assert.rejects(
    readNativeMessage(Readable.from([Buffer.from([1, 0, 0, 0, 123])])),
    SyntaxError,
  );
});

test("capture uses the service port and a private, single-use file", async (t) => {
  await withService(t, { type: "ready", url: "http://127.0.0.1:43219/" }, async (dataDir) => {
    const result = await captureToWeb(selection, { dataDir });
    const url = new URL(result.url);
    assert.equal(result.ok, true);
    assert.equal(url.origin, "http://127.0.0.1:43219");
    assert.equal(url.pathname, "/generator");
    const id = url.searchParams.get("capture");
    assert.match(id, /^[a-f0-9]{32}$/);
    assert.equal(url.search.includes("cat"), false);
    const captures = path.join(dataDir, "captures");
    assert.equal((await fs.stat(path.join(captures, `${id}.json`))).mode & 0o777, 0o600);
    assert.equal((await fs.stat(captures)).mode & 0o777, 0o700);
    assert.equal(await consumeCapture(id, captures), selection.text);
    await assert.rejects(consumeCapture(id, captures), { code: "ENOENT" });
  });
});

test("invalid selections are rejected before connecting", async () => {
  for (const message of [
    null,
    {},
    { ...selection, type: "other" },
    { ...selection, text: " " },
    { ...selection, text: "a".repeat(30_001) },
  ]) {
    await assert.rejects(captureToWeb(message), /选中文本无效/);
  }
});

test("missing service does not create a daemon or capture", async (t) => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "pw-not-running-"));
  t.after(() => fs.rm(dataDir, { recursive: true, force: true }));
  await assert.rejects(captureToWeb(selection, { dataDir }), /先在终端运行并保持 phraseweave/);
  assert.deepEqual(await fs.readdir(dataDir), []);
});

test("control connections time out promptly", async (t) => {
  await withService(t, undefined, (dataDir) =>
    assert.rejects(captureToWeb(selection, { dataDir, timeoutMs: 30 }), /无法连接本机服务/),
  );
});

test("foreign, HTTPS and credential-bearing addresses are rejected", async (t) => {
  for (const url of [
    "https://127.0.0.1:3000/",
    "http://example.com/",
    "http://user@127.0.0.1:3000/",
  ]) {
    await withService(t, { type: "ready", url }, async (dataDir) => {
      await assert.rejects(captureToWeb(selection, { dataDir }), /无法连接本机服务/);
      assert.deepEqual(await fs.readdir(dataDir), ["service.sock"]);
    });
  }
});

test("installer is repeatable and wrapper handles spaces and shell metacharacters", async (t) => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "pw home ' $-"));
  t.after(() => fs.rm(home, { recursive: true, force: true }));
  const dataDir = path.join(home, "Application Support");
  const bin = path.join(home, "package ' bin");
  await fs.cp(fileURLToPath(new URL("../bin", import.meta.url)), bin, { recursive: true });
  const node = path.join(home, "node executable");
  await fs.symlink(process.execPath, node);
  const args = { home, dataDir, node, entry: path.join(bin, "native-host.mjs") };
  const first = await installExtension(args);
  assert.deepEqual(await installExtension(args), first);
  const manifest = JSON.parse(await fs.readFile(first.manifest, "utf8"));
  assert.equal(manifest.name, NATIVE_HOST);
  assert.equal(manifest.path, first.wrapper);
  assert.equal((await fs.stat(first.wrapper)).mode & 0o777, 0o700);
  assert.deepEqual(manifest.allowed_origins, [
    "chrome-extension://mdjoodikmclnnbcdaiiiibihemokenjg/",
  ]);
  const output = await new Promise((resolve, reject) => {
    const child = spawn(first.wrapper, [], { stdio: ["pipe", "pipe", "pipe"] });
    const chunks = [];
    child.stdout.on("data", (chunk) => chunks.push(chunk));
    child.once("error", reject);
    child.once("close", (code) =>
      code === 0 ? resolve(Buffer.concat(chunks)) : reject(new Error(`exit ${code}`)),
    );
    const bytes = encodeNativeMessage(selection);
    child.stdin.write(bytes.subarray(0, 2));
    child.stdin.end(bytes.subarray(2));
  });
  const reply = await readNativeMessage(Readable.from([output]));
  assert.equal(reply.ok, false);
  assert.match(reply.error, /先在终端运行并保持 phraseweave/);
});
