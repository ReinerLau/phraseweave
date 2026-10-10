import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

import { validateUsername } from "./remote-auth.mjs";
import { DATA_DIR } from "./shared.mjs";

const CONFIG_PATH = path.join(DATA_DIR, "remote.json");
const TUNNEL_CONFIG_PATH = path.join(DATA_DIR, "cloudflared-runtime.yml");

export function validateRemoteConfig(config) {
  const origin = new URL(config.origin);
  if (
    origin.protocol !== "https:" ||
    origin.pathname !== "/" ||
    origin.search ||
    origin.hash ||
    origin.port ||
    origin.username ||
    origin.password
  ) {
    throw new Error("远程地址必须是 HTTPS 域名，不包含路径或端口。");
  }
  if (
    typeof config.tunnelId !== "string" ||
    !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(config.tunnelId)
  )
    throw new Error("无效的 Tunnel ID。");
  if (typeof config.credentialsFile !== "string" || !path.isAbsolute(config.credentialsFile))
    throw new Error("凭据文件必须使用绝对路径。");
  const auth = config.auth ?? "cloudflare-access";
  if (auth === "password") {
    const username = validateUsername(config.username ?? "phraseweave");
    return {
      origin: origin.origin,
      tunnelId: config.tunnelId,
      credentialsFile: config.credentialsFile,
      auth,
      username,
    };
  }
  if (auth !== "cloudflare-access") throw new Error("无效的远程认证方式。");
  if (typeof config.teamName !== "string" || !/^[a-z0-9-]+$/.test(config.teamName))
    throw new Error("无效的 Access 团队名称。");
  if (typeof config.audTag !== "string" || !/^[A-Za-z0-9_-]+$/.test(config.audTag))
    throw new Error("无效的 Access AUD 标签。");
  return {
    origin: origin.origin,
    tunnelId: config.tunnelId,
    credentialsFile: config.credentialsFile,
    auth,
    teamName: config.teamName,
    audTag: config.audTag,
  };
}

export async function saveRemoteConfig(config) {
  const valid = validateRemoteConfig(config);
  await fs.access(valid.credentialsFile);
  await fs.mkdir(DATA_DIR, { recursive: true, mode: 0o700 });
  await fs.writeFile(CONFIG_PATH, `${JSON.stringify(valid, null, 2)}\n`, { mode: 0o600 });
  await fs.chmod(CONFIG_PATH, 0o600);
  return valid;
}

export async function loadRemoteConfig() {
  try {
    return validateRemoteConfig(JSON.parse(await fs.readFile(CONFIG_PATH, "utf8")));
  } catch (error) {
    if (error.code === "ENOENT") return undefined;
    throw error;
  }
}

export async function disableRemote() {
  await fs.rm(CONFIG_PATH, { force: true });
}

export function renderTunnelConfig(config, localUrl) {
  const local = new URL(localUrl);
  return [
    `tunnel: ${JSON.stringify(config.tunnelId)}`,
    `credentials-file: ${JSON.stringify(config.credentialsFile)}`,
    "ingress:",
    `  - hostname: ${JSON.stringify(new URL(config.origin).hostname)}`,
    `    service: ${JSON.stringify(local.origin)}`,
    "    originRequest:",
    `      httpHostHeader: ${JSON.stringify(local.host)}`,
    ...(config.auth === "password"
      ? []
      : [
          "      access:",
          "        required: true",
          `        teamName: ${JSON.stringify(config.teamName)}`,
          "        audTag:",
          `          - ${JSON.stringify(config.audTag)}`,
        ]),
    "  - service: http_status:404",
    "",
  ].join("\n");
}

export async function startTunnel(config, localUrl) {
  if (!config) return undefined;
  const yaml = renderTunnelConfig(config, localUrl);
  await fs.writeFile(TUNNEL_CONFIG_PATH, yaml, { mode: 0o600 });
  const log = await fs.open(path.join(DATA_DIR, "cloudflared.log"), "a", 0o600);
  try {
    const child = spawn(
      "cloudflared",
      ["tunnel", "--config", TUNNEL_CONFIG_PATH, "run", config.tunnelId],
      {
        stdio: ["ignore", log.fd, log.fd],
      },
    );
    child.on("error", (error) =>
      process.stderr.write(`Cloudflare Tunnel 启动失败：${error.message}\n`),
    );
    child.on("exit", (code) => process.stderr.write(`Cloudflare Tunnel 已退出 (${code})。\n`));
    return child;
  } finally {
    await log.close();
  }
}
