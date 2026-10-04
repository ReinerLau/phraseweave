import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

test("concurrent entrypoints reuse one server and recover from a foreign port occupant", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "phraseweave-process-test-"));
  process.env.PHRASEWEAVE_DATA_DIR = directory;
  const { connectOrStart, SOCKET_PATH } = await import("../bin/shared.mjs");
  const entry = fileURLToPath(new URL("./fixtures/mock-daemon.mjs", import.meta.url));
  const occupied = http.createServer((_request, response) => response.end("other app"));
  await new Promise((resolve) => occupied.listen(0, "127.0.0.1", resolve));
  const port = occupied.address().port;
  let clients = [];
  try {
    clients = await Promise.all([
      connectOrStart({ entry, port, env: process.env }),
      connectOrStart({ entry, port, env: process.env }),
    ]);
    assert.equal(clients[0].ready.url, clients[1].ready.url);
    assert.notEqual(new URL(clients[0].ready.url).port, String(port));
    assert.equal(
      (await fs.readFile(path.join(directory, "starts"), "utf8")).trim().split("\n").length,
      1,
    );
    clients[0].socket.destroy();
    await new Promise((resolve) => setTimeout(resolve, 1200));
    assert.equal((await fetch(clients[1].ready.url)).status, 200);
    clients[1].socket.destroy();
    for (let index = 0; index < 30; index += 1) {
      if (!(await fs.stat(SOCKET_PATH).catch(() => undefined))) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.equal(await fs.stat(SOCKET_PATH).catch(() => undefined), undefined);
    const failedAt = Date.now();
    await assert.rejects(
      connectOrStart({ entry: path.join(directory, "missing-daemon.mjs"), port, env: process.env }),
      /服务启动失败|服务未能启动/,
    );
    assert.ok(Date.now() - failedAt < 5000, "a failed daemon should report promptly");
  } finally {
    for (const client of clients) client.socket.destroy();
    const starts = await fs.readFile(path.join(directory, "starts"), "utf8").catch(() => "");
    for (const pid of starts.trim().split("\n")) {
      if (pid)
        try {
          process.kill(Number(pid), "SIGTERM");
        } catch {}
    }
    await new Promise((resolve) => occupied.close(resolve));
    await fs.rm(directory, { recursive: true, force: true });
  }
});
