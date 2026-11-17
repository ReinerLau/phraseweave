import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import { connectShared, startControlServer } from "../bin/shared.mjs";

test("multiple local clients reuse one service until the last client disconnects", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "phraseweave-shared-test-"));
  const socketPath = path.join(directory, "service.sock");
  let idleCount = 0;
  const control = await startControlServer(() => {
    idleCount += 1;
  }, socketPath);
  try {
    const first = connectShared(socketPath);
    const second = connectShared(socketPath);
    control.setReady({ type: "ready", url: "http://127.0.0.1:4567/", version: "1.0.10" });
    const clients = await Promise.all([first, second]);
    assert.equal(clients[0].ready.url, clients[1].ready.url);
    clients[0].socket.destroy();
    await new Promise((resolve) => setTimeout(resolve, 1100));
    assert.equal(idleCount, 0);
    clients[1].socket.destroy();
    await new Promise((resolve) => setTimeout(resolve, 1100));
    assert.equal(idleCount, 1);
  } finally {
    await control.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("import persistence survives client exit and stop preserves active sessions", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "phraseweave-background-test-"));
  const socketPath = path.join(directory, "service.sock");
  let idle = 0;
  const control = await startControlServer(() => idle++, socketPath);
  control.setReady({ type: "ready", url: "http://127.0.0.1:4567/" });
  try {
    const client = await connectShared(socketPath);
    await new Promise((resolve) => {
      client.socket.once("data", resolve);
      client.socket.write("background\n");
    });
    client.socket.destroy();
    await new Promise((resolve) => setTimeout(resolve, 1100));
    assert.equal(idle, 0);
    const desktop = await connectShared(socketPath);
    const stopper = await connectShared(socketPath);
    stopper.socket.write("stop\n");
    await new Promise((resolve) => stopper.socket.once("close", resolve));
    await new Promise((resolve) => setTimeout(resolve, 1100));
    assert.equal(idle, 0);
    desktop.socket.destroy();
    await new Promise((resolve) => setTimeout(resolve, 1100));
    assert.equal(idle, 1);
  } finally {
    await control.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
});
