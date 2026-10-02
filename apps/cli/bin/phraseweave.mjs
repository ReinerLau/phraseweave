#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { GeneratorRuntime, snapshotRuntime } from "./runtime.mjs";
import { startPageServer } from "./server.mjs";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const metadata = JSON.parse(await fs.readFile(path.join(packageRoot, "package.json"), "utf8"));

function options(argv) {
  const parsed = { port: 3000, jsonReady: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--port") {
      const value = Number(argv[++index]);
      if (!Number.isInteger(value) || value < 0 || value > 65535) throw new Error("Invalid port.");
      parsed.port = value;
    } else if (arg === "--json-ready") parsed.jsonReady = true;
    else if (arg === "--version") parsed.version = true;
    else if (arg === "--help") parsed.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return parsed;
}

async function main() {
  const flags = options(process.argv.slice(2));
  if (flags.version) {
    process.stdout.write(`${metadata.version}\n`);
    return;
  }
  if (flags.help) {
    process.stdout.write("Usage: phraseweave [--port PORT] [--json-ready] [--version]\n");
    return;
  }
  if (process.platform !== "darwin" || process.arch !== "arm64") {
    throw new Error("PhraseWeave currently supports Apple Silicon macOS only.");
  }
  const source = path.join(packageRoot, "runtime");
  const root =
    process.env.PHRASEWEAVE_DEV_RUNTIME === "1"
      ? source
      : await snapshotRuntime(source, metadata.version);
  const runtime = new GeneratorRuntime(root);
  await runtime.start();
  let server;
  let url;
  try {
    ({ server, url } = await startPageServer({
      clientRoot: path.join(root, "client"),
      runtime,
      port: flags.port,
    }));
  } catch (error) {
    runtime.stop();
    throw error;
  }
  if (flags.jsonReady)
    process.stdout.write(`${JSON.stringify({ type: "ready", url, version: metadata.version })}\n`);
  else process.stdout.write(`PhraseWeave: ${url}\nPress Ctrl-C to stop.\n`);
  const stop = () => {
    server.close();
    runtime.stop();
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
}

main().catch((error) => {
  process.stderr.write(`PhraseWeave failed to start: ${error.message}\n`);
  process.exitCode = 1;
});
