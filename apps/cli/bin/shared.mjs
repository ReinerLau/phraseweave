import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";

export const DATA_DIR =
  process.env.PHRASEWEAVE_DATA_DIR ||
  path.join(os.homedir(), "Library", "Application Support", "PhraseWeave");
export const SOCKET_PATH = path.join(DATA_DIR, "service.sock");
const START_LOCK = path.join(DATA_DIR, "service-start.lock");
const START_TIMEOUT_MS = 5 * 60_000;

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function connectShared(socketPath = SOCKET_PATH) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection(socketPath);
    let buffer = "";
    let settled = false;
    const timer = setTimeout(() => fail(new Error("PhraseWeave 服务启动超时。")), START_TIMEOUT_MS);
    function fail(error) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.destroy();
      reject(error);
    }
    socket.once("error", fail);
    socket.on("data", (chunk) => {
      buffer += chunk;
      const end = buffer.indexOf("\n");
      if (end < 0 || settled) return;
      try {
        const ready = JSON.parse(buffer.slice(0, end));
        if (ready.type !== "ready" || new URL(ready.url).hostname !== "127.0.0.1") {
          throw new Error("端口上的服务不是 PhraseWeave。");
        }
        settled = true;
        clearTimeout(timer);
        resolve({ socket, ready });
      } catch (error) {
        fail(error);
      }
    });
    socket.once("close", () => fail(new Error("PhraseWeave 服务未能启动。")));
  });
}

async function tryConnect() {
  try {
    return await connectShared();
  } catch (error) {
    if (["ENOENT", "ECONNREFUSED"].includes(error.code)) return undefined;
    throw error;
  }
}

export async function connectOrStart({ entry, port, env = process.env }) {
  await fs.mkdir(DATA_DIR, { recursive: true, mode: 0o700 });
  const existing = await tryConnect();
  if (existing) return existing;
  const deadline = Date.now() + START_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      await fs.mkdir(START_LOCK);
      try {
        const connected = await tryConnect();
        if (connected) return connected;
        const log = await fs.open(path.join(DATA_DIR, "service.log"), "a", 0o600);
        let startupError;
        try {
          const child = spawn(process.execPath, [entry, "--serve-daemon", "--port", String(port)], {
            detached: true,
            stdio: ["ignore", log.fd, log.fd],
            env,
          });
          child.once("error", (error) => {
            startupError = error;
          });
          child.once("exit", (code, signal) => {
            startupError = new Error(`服务进程已退出 (${signal || code})。`);
          });
          child.unref();
        } finally {
          await log.close();
        }
        while (Date.now() < deadline) {
          if (startupError) {
            throw new Error(
              `PhraseWeave 服务启动失败：${startupError.message} 请查看 ${path.join(DATA_DIR, "service.log")}`,
            );
          }
          const started = await tryConnect();
          if (started) return started;
          await delay(100);
        }
        throw new Error(`PhraseWeave 服务启动超时。请查看 ${path.join(DATA_DIR, "service.log")}`);
      } finally {
        await fs.rmdir(START_LOCK).catch(() => {});
      }
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      const connected = await tryConnect();
      if (connected) return connected;
      const stat = await fs.stat(START_LOCK).catch(() => undefined);
      if (stat && Date.now() - stat.mtimeMs > START_TIMEOUT_MS) {
        await fs.rmdir(START_LOCK).catch(() => {});
      }
      await delay(100);
    }
  }
  throw new Error("PhraseWeave 服务启动超时。");
}

export async function startControlServer(onIdle, socketPath = SOCKET_PATH) {
  await fs.mkdir(path.dirname(socketPath), { recursive: true, mode: 0o700 });
  await fs.rm(socketPath, { force: true });
  const clients = new Set();
  let ready;
  let idleTimer;
  const server = net.createServer((socket) => {
    clearTimeout(idleTimer);
    clients.add(socket);
    if (ready) socket.write(`${JSON.stringify(ready)}\n`);
    socket.once("close", () => {
      clients.delete(socket);
      if (clients.size === 0) idleTimer = setTimeout(onIdle, 1000);
    });
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(socketPath, resolve);
  });
  await fs.chmod(socketPath, 0o600);
  return {
    setReady(value) {
      ready = value;
      for (const socket of clients) socket.write(`${JSON.stringify(value)}\n`);
      if (clients.size === 0) idleTimer = setTimeout(onIdle, 1000);
    },
    async close() {
      clearTimeout(idleTimer);
      for (const socket of clients) socket.destroy();
      await new Promise((resolve) => server.close(resolve));
      await fs.rm(socketPath, { force: true });
    },
  };
}
