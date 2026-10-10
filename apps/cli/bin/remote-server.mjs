import { randomBytes } from "node:crypto";
import http from "node:http";
import { isIP } from "node:net";

import { AUTH_FILE, loadPassword, verifyPassword } from "./remote-auth.mjs";

const COOKIE = "__Host-phraseweave_remote";
const SESSION_MS = 24 * 60 * 60_000;
const ATTEMPT_MS = 10 * 60_000;
const MAX_FAILURES = 5;
const escapeHtml = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character],
  );

export function safeReturnPath(value, origin) {
  if (
    typeof value !== "string" ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    /[\\\x00-\x1f\x7f]/.test(value)
  )
    return "/";
  const url = new URL(value, origin);
  if (url.origin !== origin || url.pathname.startsWith("/remote/")) return "/";
  return `${url.pathname}${url.search}${url.hash}`;
}

function loginPage(username, returnTo, message = "") {
  return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>登录 · PhraseWeave</title>
<style>html{color-scheme:light dark}body{margin:0;font:16px system-ui;background:#f4f3fa;color:#252238;display:grid;min-height:100dvh;place-items:center}main{box-sizing:border-box;width:min(100%,420px);padding:32px}h1{font-size:28px}label{display:block;margin:20px 0 8px}input,button{box-sizing:border-box;width:100%;font:inherit;border-radius:10px;padding:14px}input{border:1px solid #999;background:white;color:#252238}button{margin-top:24px;border:0;background:#7448cd;color:white;cursor:pointer}p{line-height:1.6}.error{color:#ad2222}@media(prefers-color-scheme:dark){body{background:#191724;color:#eee}input{background:#272336;color:#eee}.error{color:#ff9c9c}}</style>
<main><h1>PhraseWeave</h1><p>登录后访问练习和学习进度。</p>${message ? `<p class="error" role="alert">${escapeHtml(message)}</p>` : ""}
<form action="/remote/login" method="post"><input type="hidden" name="returnTo" value="${escapeHtml(returnTo)}"><label for="username">用户名</label><input id="username" name="username" autocomplete="username" value="${escapeHtml(username)}" maxlength="64" required><label for="password">密码</label><input id="password" name="password" type="password" autocomplete="current-password" required><button type="submit">登录</button></form></main></html>`;
}

function cookie(value, clear = false) {
  return `${COOKIE}=${value}; Path=/; Secure; HttpOnly; SameSite=Strict${clear ? "; Max-Age=0" : ""}`;
}

function reply(response, status, body, headers = {}) {
  response.writeHead(status, {
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "same-origin",
    "Content-Type": "application/json; charset=utf-8",
    ...headers,
  });
  response.end(
    body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  );
}

function html(response, status, body, headers = {}) {
  reply(response, status, body, {
    "Content-Type": "text/html; charset=utf-8",
    "Content-Security-Policy":
      "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
    ...headers,
  });
}

async function readForm(request) {
  if (
    request.headers["content-type"]?.split(";")[0].trim() !== "application/x-www-form-urlencoded"
  ) {
    throw Object.assign(new Error("请求格式错误。"), { status: 415 });
  }
  const chunks = [];
  let length = 0;
  for await (const chunk of request) {
    length += chunk.length;
    if (length > 8192) throw Object.assign(new Error("请求过大。"), { status: 413 });
    chunks.push(chunk);
  }
  return new URLSearchParams(Buffer.concat(chunks).toString("utf8"));
}

function proxyHeaders(headers) {
  const result = { ...headers };
  const connectionHeaders = String(result.connection || "")
    .split(",")
    .map((item) => item.trim().toLowerCase());
  for (const name of [
    ...connectionHeaders,
    "connection",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "te",
    "trailer",
    "transfer-encoding",
    "upgrade",
    "cookie",
    "set-cookie",
  ])
    delete result[name];
  return result;
}

function proxy(request, response, local, url) {
  const upstream = http.request(
    {
      hostname: local.hostname,
      port: local.port,
      path: `${url.pathname}${url.search}`,
      method: request.method,
      headers: { ...proxyHeaders(request.headers), host: local.host },
    },
    (incoming) => {
      response.writeHead(incoming.statusCode, {
        ...proxyHeaders(incoming.headers),
        "Cache-Control": "no-store",
      });
      incoming.on("error", () => response.destroy());
      incoming.pipe(response);
    },
  );
  upstream.setTimeout(30_000, () => upstream.destroy(new Error("Upstream timeout")));
  upstream.on("error", () => {
    if (!response.headersSent) reply(response, 502, { error: "本机服务暂时无法连接。" });
    else response.destroy();
  });
  request.on("aborted", () => upstream.destroy());
  response.on("close", () => upstream.destroy());
  request.pipe(upstream);
}

export async function startRemoteServer({
  config,
  localUrl,
  authFile = AUTH_FILE,
  now = Date.now,
}) {
  const local = new URL(localUrl);
  if (local.protocol !== "http:" || local.hostname !== "127.0.0.1" || !local.port)
    throw new Error("远程网关只能连接本机服务。");
  await loadPassword(authFile, config.username);
  const sessions = new Map();
  const attempts = new Map();
  let revision;
  let verifying = 0;
  let gatewayHost;
  const server = http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url, config.origin);
      if (request.headers.host !== gatewayHost || url.origin !== config.origin)
        return reply(response, 403, { error: "访问来源不允许。" });
      const mutation = !["GET", "HEAD"].includes(request.method);
      if (
        (mutation && request.headers.origin !== config.origin) ||
        (request.headers["sec-fetch-site"] === "cross-site" && url.pathname.startsWith("/api/"))
      ) {
        return reply(response, 403, { error: "访问来源不允许。" });
      }
      // Reload for every request: resets invalidate sessions without restarting the daemon.
      const credentials = await loadPassword(authFile, config.username);
      if (revision !== credentials.revision) {
        revision = credentials.revision;
        sessions.clear();
      }
      const time = now();
      for (const [token, session] of sessions) if (session.expires <= time) sessions.delete(token);
      for (const [ip, attempt] of attempts)
        if (attempt.until <= time && !attempt.pending) attempts.delete(ip);
      const token = request.headers.cookie
        ?.split(";")
        .map((item) => item.trim())
        .find((item) => item.startsWith(`${COOKIE}=`))
        ?.slice(COOKIE.length + 1);
      const session = sessions.get(token);

      if (url.pathname === "/remote/login") {
        if (request.method === "GET" || request.method === "HEAD") {
          const returnTo = safeReturnPath(url.searchParams.get("returnTo"), config.origin);
          if (session) return reply(response, 303, undefined, { Location: returnTo });
          return html(
            response,
            200,
            request.method === "HEAD" ? undefined : loginPage(config.username, returnTo),
          );
        }
        if (request.method !== "POST")
          return reply(response, 405, { error: "请求方法不允许。" }, { Allow: "GET, HEAD, POST" });
        const form = await readForm(request);
        const returnTo = safeReturnPath(form.get("returnTo"), config.origin);
        const clientIp = request.headers["cf-connecting-ip"];
        const ip =
          typeof clientIp === "string" && isIP(clientIp) ? clientIp : request.socket.remoteAddress;
        let attempt = attempts.get(ip);
        if (!attempt) {
          if (attempts.size >= 1024)
            return html(
              response,
              429,
              loginPage(config.username, returnTo, "尝试过多，请稍后重试。"),
              { "Retry-After": "600" },
            );
          attempt = { failures: 0, pending: 0, until: time + ATTEMPT_MS };
          attempts.set(ip, attempt);
        }
        if (attempt.failures + attempt.pending >= MAX_FAILURES || verifying >= 2) {
          return html(
            response,
            429,
            loginPage(config.username, returnTo, "尝试过多，请稍后重试。"),
            { "Retry-After": String(Math.max(1, Math.ceil((attempt.until - time) / 1000))) },
          );
        }
        attempt.pending += 1;
        verifying += 1;
        let valid;
        try {
          valid = await verifyPassword(credentials, form.get("username"), form.get("password"));
        } finally {
          attempt.pending -= 1;
          verifying -= 1;
        }
        if (!valid) {
          attempt.failures += 1;
          return html(response, 401, loginPage(config.username, returnTo, "用户名或密码错误。"));
        }
        const current = await loadPassword(authFile, config.username);
        if (current.revision !== credentials.revision)
          return html(
            response,
            401,
            loginPage(config.username, returnTo, "密码已更新，请重新登录。"),
          );
        attempts.delete(ip);
        if (token) sessions.delete(token);
        if (sessions.size >= 256) sessions.delete(sessions.keys().next().value);
        const newToken = randomBytes(32).toString("hex");
        sessions.set(newToken, { expires: now() + SESSION_MS });
        return reply(response, 303, undefined, {
          Location: returnTo,
          "Set-Cookie": cookie(newToken),
        });
      }

      if (url.pathname === "/remote/logout") {
        if (request.method !== "POST")
          return reply(response, 405, { error: "请使用退出登录按钮。" }, { Allow: "POST" });
        sessions.delete(token);
        return reply(response, 303, undefined, {
          Location: "/remote/login",
          "Set-Cookie": cookie("", true),
        });
      }
      if (!session) {
        if (
          url.pathname.startsWith("/api/") ||
          url.pathname.startsWith("/remote/") ||
          !["GET", "HEAD"].includes(request.method)
        ) {
          return reply(
            response,
            401,
            { error: "请重新登录。", code: "REMOTE_AUTH_REQUIRED" },
            { "Set-Cookie": cookie("", true) },
          );
        }
        return reply(response, 303, undefined, {
          Location: `/remote/login?returnTo=${encodeURIComponent(safeReturnPath(`${url.pathname}${url.search}`, config.origin))}`,
        });
      }
      if (url.pathname === "/remote/session") {
        if (request.method !== "GET")
          return reply(response, 405, { error: "请求方法不允许。" }, { Allow: "GET" });
        return reply(response, 200, { username: credentials.username });
      }
      if (url.pathname.startsWith("/remote/"))
        return reply(response, 404, { error: "页面不存在。" });
      proxy(request, response, local, url);
    } catch (error) {
      if (!error.status) sessions.clear();
      reply(response, error.status || 503, {
        error: error.status ? error.message : "远程登录暂不可用，请在本机检查密码配置。",
      });
    }
  });
  server.on("close", () => sessions.clear());
  server.requestTimeout = 30_000;
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  gatewayHost = `127.0.0.1:${server.address().port}`;
  return { server, url: `http://${gatewayHost}/` };
}
