const { spawn } = require("node:child_process");
const fs = require("node:fs/promises");
const path = require("node:path");

const PACKAGE_NAME = "@reinerlau/phraseweave";
const REGISTRY = "https://npm.pkg.github.com";

function run(command, args, { env = process.env, timeout = 10_000, onProgress = () => {} } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { env, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`${path.basename(command)} timed out.`));
    }, timeout);
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr = (stderr + chunk).slice(-2000);
      const line = chunk.trim().split("\n").at(-1);
      if (line) onProgress(line);
    });
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(stdout.trim());
      else reject(new Error(stderr.trim() || `${path.basename(command)} exited with ${code}.`));
    });
  });
}

async function findTools() {
  const output = await run(
    "/bin/zsh",
    [
      "-lic",
      'printf "PW_NODE=%s\\n" "$(command -v node)"; printf "PW_NPM=%s\\n" "$(command -v npm)"',
    ],
    {
      timeout: 15_000,
    },
  );
  const node = output.match(/^PW_NODE=(.+)$/m)?.[1]?.trim();
  const npm = output.match(/^PW_NPM=(.+)$/m)?.[1]?.trim();
  if (!node || !npm || !path.isAbsolute(node) || !path.isAbsolute(npm)) {
    throw new Error("找不到 Node/npm。请先安装 Node.js，并在终端确认 npm 可用。");
  }
  return {
    node,
    npm,
    env: { ...process.env, PATH: `${path.dirname(node)}:${process.env.PATH || ""}` },
  };
}

async function installedPackage(root) {
  const directory = path.join(root, "@reinerlau", "phraseweave");
  try {
    const metadata = JSON.parse(await fs.readFile(path.join(directory, "package.json"), "utf8"));
    return metadata.name === PACKAGE_NAME ? { directory, version: metadata.version } : undefined;
  } catch {
    return undefined;
  }
}

async function installOrUpdate(
  onProgress = () => {},
  { developmentRoot, tools: suppliedTools } = {},
) {
  if (developmentRoot) {
    const metadata = JSON.parse(
      await fs.readFile(path.join(developmentRoot, "package.json"), "utf8"),
    );
    const tools = suppliedTools || (await findTools());
    return { ...tools, directory: developmentRoot, version: metadata.version };
  }
  const tools = suppliedTools || (await findTools());
  const globalRoot = await run(tools.npm, ["root", "-g"], { env: tools.env });
  let current = await installedPackage(globalRoot);
  let latest;
  try {
    latest = await run(tools.npm, ["view", PACKAGE_NAME, "version", `--registry=${REGISTRY}`], {
      env: tools.env,
      timeout: 10_000,
    });
    if (!/^\d+\.\d+\.\d+$/.test(latest)) throw new Error("Invalid package version.");
  } catch (error) {
    if (!current) throw new Error(`无法读取 GitHub Packages：${error.message}`);
    onProgress("无法检查更新，正在使用已安装版本。");
  }
  if (latest && latest !== current?.version) {
    onProgress(`正在安装 PhraseWeave ${latest}…`);
    try {
      await run(
        tools.npm,
        ["install", "-g", `${PACKAGE_NAME}@${latest}`, `--registry=${REGISTRY}`],
        {
          env: tools.env,
          timeout: 10 * 60_000,
          onProgress,
        },
      );
      current = await installedPackage(globalRoot);
      if (current?.version !== latest)
        throw new Error("Installed version does not match registry version.");
    } catch (error) {
      current = await installedPackage(globalRoot);
      if (!current) throw new Error(`npm 安装失败：${error.message}`);
      onProgress("更新失败，正在使用已安装版本。");
    }
  }
  if (!current) throw new Error("未找到已安装的 PhraseWeave npm 包。");
  return { ...tools, ...current };
}

function startPackage(installation, onProgress = () => {}) {
  return new Promise((resolve, reject) => {
    const entry = path.join(installation.directory, "bin", "phraseweave.mjs");
    const child = spawn(installation.node, [entry, "--port", "0", "--json-ready"], {
      env: installation.env,
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let ready = false;
    let buffer = "";
    let lastError = "";
    const timer = setTimeout(() => {
      stopPackage(child);
      reject(new Error("本地服务启动超时。"));
    }, 5 * 60_000);
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      buffer += chunk;
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) {
        try {
          const record = JSON.parse(line);
          const url = new URL(record.url);
          if (
            record.type === "ready" &&
            record.version === installation.version &&
            url.protocol === "http:" &&
            url.hostname === "127.0.0.1"
          ) {
            clearTimeout(timer);
            ready = true;
            resolve({ child, url: url.toString() });
          }
        } catch {
          /* Ignore unrelated output. */
        }
      }
    });
    child.stderr.on("data", (chunk) => {
      lastError = (lastError + chunk).slice(-2000);
      const line = chunk.trim().split("\n").at(-1);
      if (line) onProgress(line);
    });
    child.once("error", (error) => {
      clearTimeout(timer);
      if (!ready) reject(error);
    });
    child.once("exit", (code) => {
      clearTimeout(timer);
      if (!ready) reject(new Error(lastError.trim() || `PhraseWeave exited (${code}).`));
    });
  });
}

function stopPackage(child) {
  if (!child?.pid) return;
  try {
    process.kill(-child.pid, "SIGTERM");
  } catch {
    child.kill();
  }
}

module.exports = { installOrUpdate, startPackage, stopPackage };
