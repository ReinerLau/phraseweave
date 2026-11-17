import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";

import { connectOrStart } from "./shared.mjs";

export async function importExercise(args, { entry }) {
  const options = { title: "", requestId: randomUUID() };
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === "--json") options.json = true;
    else if (["--file", "--title", "--request-id"].includes(arg)) {
      const value = args[++index];
      if (!value || value.startsWith("--")) throw new Error(`${arg} 缺少参数。`);
      options[{ "--file": "file", "--title": "title", "--request-id": "requestId" }[arg]] = value;
    } else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!options.file) throw new Error("请使用 --file PATH 或 --file - 提供双语练习链。");
  let socket;
  try {
    let text;
    if (options.file === "-") {
      process.stdin.setEncoding("utf8");
      text = "";
      for await (const chunk of process.stdin) text += chunk;
    } else {
      text = await fs.readFile(options.file, "utf8");
    }
    const connection = await connectOrStart({ entry });
    socket = connection.socket;
    const { ready } = connection;
    const origin = new URL(ready.url).origin;
    const response = await fetch(new URL("/api/local-exercises/import", ready.url), {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: origin },
      body: JSON.stringify({ text, title: options.title, requestId: options.requestId }),
      signal: AbortSignal.timeout(60_000),
    });
    const result = await response.json().catch(() => ({}));
    if (response.status === 404) {
      throw new Error("正在运行的服务尚不支持导入，请关闭旧版 PhraseWeave 后重试。");
    }
    if (!response.ok) throw new Error(result.error || `导入失败 (${response.status})`);
    await new Promise((resolve, reject) => {
      let buffer = "";
      const failure = new Error("后台保活失败，请升级并重启本地服务。");
      function finish(error) {
        clearTimeout(timer);
        socket.off("data", onData);
        socket.off("close", onClose);
        if (error) reject(error);
        else resolve();
      }
      function onClose() {
        finish(failure);
      }
      function onData(chunk) {
        buffer += chunk.toString();
        if (buffer.includes('{"type":"background"}\n')) finish();
      }
      const timer = setTimeout(onClose, 3000);
      socket.on("data", onData);
      socket.once("close", onClose);
      socket.write("background\n");
    });
    const output = {
      ...result,
      requestId: options.requestId,
      url: new URL(result.path, ready.url).href,
    };
    process.stdout.write(
      options.json
        ? `${JSON.stringify(output)}\n`
        : `${result.title} · ${result.count} 条\n${output.url}\n`,
    );
  } catch (error) {
    throw new Error(`${error.message}\n重试相同内容请使用 --request-id ${options.requestId}。`);
  } finally {
    socket?.destroy();
  }
}
