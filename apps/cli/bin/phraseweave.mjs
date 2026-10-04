#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { disableRemote, loadRemoteConfig, saveRemoteConfig, startTunnel } from "./remote.mjs";
import { GeneratorRuntime, snapshotRuntime } from "./runtime.mjs";
import { startPageServer } from "./server.mjs";
import { connectOrStart, DATA_DIR, startControlServer } from "./shared.mjs";

const entry = fileURLToPath(import.meta.url);
const packageRoot = path.resolve(path.dirname(entry), "..");
const metadata = JSON.parse(await fs.readFile(path.join(packageRoot, "package.json"), "utf8"));

function options(argv) {
  const parsed = { jsonReady: false, launcherClient: false, serveDaemon: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--port") {
      const value = Number(argv[++index]);
      if (!Number.isInteger(value) || value < 0 || value > 65535) throw new Error("Invalid port.");
      parsed.port = value;
    } else if (arg === "--json-ready") parsed.jsonReady = true;
    else if (arg === "--launcher-client") parsed.launcherClient = true;
    else if (arg === "--serve-daemon") parsed.serveDaemon = true;
    else if (arg === "--version") parsed.version = true;
    else if (arg === "--help") parsed.help = true;
    else if (arg === "remote") {
      parsed.remote = argv[++index];
      parsed.remoteArgs = argv.slice(index + 1);
      break;
    } else throw new Error(`Unknown argument: ${arg}`);
  }
  return parsed;
}

async function preferredPagePort() {
  try {
    const port = Number(await fs.readFile(path.join(DATA_DIR, "page-server-port"), "utf8"));
    if (Number.isInteger(port) && port > 0 && port < 65536) return port;
  } catch {
    // New installations use port 3000.
  }
  return 3000;
}

async function handleRemote(command, args) {
  if (command === "disable") {
    await disableRemote();
    process.stdout.write("远程访问已禁用；重启 PhraseWeave 后生效。\n");
    return;
  }
  if (command === "status") {
    const config = await loadRemoteConfig();
    process.stdout.write(config ? `${config.origin}\n` : "远程访问尚未配置。\n");
    return;
  }
  if (command !== "configure")
    throw new Error(
      "Usage: phraseweave remote configure --origin URL --tunnel-id UUID --credentials-file PATH --team-name NAME --aud-tag TAG",
    );
  const values = {};
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index];
    const value = args[index + 1];
    if (!key?.startsWith("--") || !value) throw new Error("远程配置参数不完整。");
    values[key.slice(2)] = value;
  }
  const config = await saveRemoteConfig({
    origin: values.origin,
    tunnelId: values["tunnel-id"],
    credentialsFile: values["credentials-file"],
    teamName: values["team-name"],
    audTag: values["aud-tag"],
  });
  process.stdout.write(`已配置 ${config.origin}；重启 PhraseWeave 后生效。\n`);
}

async function serveDaemon(port) {
  let server;
  let runtime;
  let tunnel;
  let control;
  let stopping = false;
  const stop = async () => {
    if (stopping) return;
    stopping = true;
    tunnel?.kill("SIGTERM");
    if (server) await new Promise((resolve) => server.close(resolve));
    runtime?.stop();
    await control?.close();
    process.exit(0);
  };
  control = await startControlServer(() => void stop());
  process.once("SIGINT", () => void stop());
  process.once("SIGTERM", () => void stop());
  try {
    const source = path.join(packageRoot, "runtime");
    const root =
      process.env.PHRASEWEAVE_DEV_RUNTIME === "1"
        ? source
        : await snapshotRuntime(source, metadata.version);
    runtime = new GeneratorRuntime(root);
    await runtime.start();
    const remote = await loadRemoteConfig();
    const started = await startPageServer({
      clientRoot: path.join(root, "client"),
      runtime,
      port,
      remoteOrigin: remote?.origin,
    });
    server = started.server;
    await fs.writeFile(path.join(DATA_DIR, "page-server-port"), `${new URL(started.url).port}\n`);
    tunnel = await startTunnel(remote, started.url);
    control.setReady({ type: "ready", url: started.url, version: metadata.version });
  } catch (error) {
    process.stderr.write(`PhraseWeave 服务启动失败：${error.stack || error.message}\n`);
    await stop();
  }
}

async function runClient(flags) {
  const { socket, ready } = await connectOrStart({
    entry,
    port: flags.port ?? (await preferredPagePort()),
  });
  if (flags.jsonReady) process.stdout.write(`${JSON.stringify(ready)}\n`);
  else process.stdout.write(`PhraseWeave: ${ready.url}\nPress Ctrl-C to stop.\n`);
  const close = () => socket.destroy();
  process.once("SIGINT", close);
  process.once("SIGTERM", close);
  if (flags.launcherClient) {
    process.stdin.resume();
    process.stdin.once("end", close);
  }
  socket.once("close", () => {
    if (flags.launcherClient) process.stdin.pause();
  });
}

async function main() {
  const flags = options(process.argv.slice(2));
  if (flags.version) return process.stdout.write(`${metadata.version}\n`);
  if (flags.help) {
    return process.stdout.write(
      "Usage: phraseweave [--port PORT] [--json-ready] [--version] | remote configure|status|disable\n",
    );
  }
  if (process.platform !== "darwin" || process.arch !== "arm64") {
    throw new Error("PhraseWeave currently supports Apple Silicon macOS only.");
  }
  if (flags.remote) return handleRemote(flags.remote, flags.remoteArgs);
  if (flags.serveDaemon) return serveDaemon(flags.port ?? 3000);
  return runClient(flags);
}

main().catch((error) => {
  process.stderr.write(`PhraseWeave failed to start: ${error.message}\n`);
  process.exitCode = 1;
});
