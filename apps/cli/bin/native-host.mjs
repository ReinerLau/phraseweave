import { randomBytes } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { connectShared, DATA_DIR } from "./shared.mjs";

export async function readNativeMessage(input) {
  let buffer = Buffer.alloc(0);
  let size;
  for await (const chunk of input) {
    buffer = Buffer.concat([buffer, chunk]);
    if (size === undefined && buffer.length >= 4) {
      size = buffer.readUInt32LE(0);
      if (size === 0 || size > 300_000) throw new Error("无效的扩展消息长度。");
    }
    if (size !== undefined && buffer.length >= size + 4) {
      return JSON.parse(buffer.subarray(4, size + 4).toString("utf8"));
    }
  }
  throw new Error("扩展消息不完整。");
}

export function encodeNativeMessage(value) {
  const body = Buffer.from(JSON.stringify(value), "utf8");
  const header = Buffer.alloc(4);
  header.writeUInt32LE(body.length);
  return Buffer.concat([header, body]);
}

export async function captureToWeb(message, { dataDir = DATA_DIR, timeoutMs = 5000 } = {}) {
  if (
    message?.type !== "capture" ||
    typeof message.text !== "string" ||
    !message.text.trim() ||
    message.text.length > 30_000
  ) {
    throw new Error("选中文本无效，请选择 1 至 30,000 个字符后重试。");
  }
  let connection;
  try {
    connection = await connectShared(path.join(dataDir, "service.sock"), timeoutMs);
  } catch {
    throw new Error("无法连接本机服务，请先在终端运行并保持 phraseweave，再重试导入。");
  }
  try {
    const id = randomBytes(16).toString("hex");
    const captures = path.join(dataDir, "captures");
    await fs.mkdir(captures, { recursive: true, mode: 0o700 });
    const file = path.join(captures, `${id}.json`);
    await fs.writeFile(file, JSON.stringify({ text: message.text }), { mode: 0o600, flag: "wx" });
    const url = new URL(`/generator?capture=${id}`, connection.ready.url);
    return { ok: true, url: url.toString() };
  } finally {
    connection.socket.destroy();
  }
}

async function main() {
  try {
    const args = process.argv.slice(2);
    const dataDir = args.length === 2 && args[0] === "--data-dir" ? args[1] : DATA_DIR;
    const message = await readNativeMessage(process.stdin);
    process.stdout.write(encodeNativeMessage(await captureToWeb(message, { dataDir })));
  } catch (error) {
    process.stdout.write(encodeNativeMessage({ ok: false, error: error.message }));
  }
}

if (process.argv[1] && (await fs.realpath(process.argv[1])) === fileURLToPath(import.meta.url)) {
  await main();
}
