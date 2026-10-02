#!/usr/bin/env node
import fs from "node:fs/promises";
import os from "node:os";
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

async function desktopPagePort() {
  const userData = path.join(os.homedir(), "Library", "Application Support", "PhraseWeave");
  try {
    const port = Number(await fs.readFile(path.join(userData, "page-server-port"), "utf8"));
    if (Number.isInteger(port) && port > 0 && port < 65536) return port;
  } catch {
    // Find the most recently used local origin when upgrading the launcher.
  }
  try {
    const indexedDb = path.join(userData, "IndexedDB");
    const entries = await fs.readdir(indexedDb, { withFileTypes: true });
    const candidates = await Promise.all(
      entries.flatMap((entry) => {
        const match =
          entry.isDirectory() && entry.name.match(/^http_127\.0\.0\.1_(\d+)\.indexeddb\.leveldb$/);
        if (!match) return [];
        return fs.stat(path.join(indexedDb, entry.name)).then((stat) => ({
          port: Number(match[1]),
          modified: stat.mtimeMs,
        }));
      }),
    );
    candidates.sort((left, right) => right.modified - left.modified);
    if (candidates[0]?.port > 0 && candidates[0].port < 65536) return candidates[0].port;
  } catch {
    // A new desktop profile has no legacy local origin.
  }
  return 0;
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
  if (flags.jsonReady && flags.port === 0) flags.port = await desktopPagePort();
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
  if (flags.jsonReady) {
    const userData = path.join(os.homedir(), "Library", "Application Support", "PhraseWeave");
    try {
      await fs.mkdir(userData, { recursive: true });
      await fs.writeFile(path.join(userData, "page-server-port"), `${new URL(url).port}\n`, "utf8");
    } catch (error) {
      process.stderr.write(`Unable to save the desktop page port: ${error.message}\n`);
    }
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
