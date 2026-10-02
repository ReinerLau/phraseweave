import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";

const CAPTURE_ID = /^[a-f0-9]{32}$/;
const JOB_ID = /^[a-f0-9]{32}$/;
const MAX_CAPTURE_AGE_MS = 10 * 60 * 1000;
const MAX_BODY_BYTES = 120_000;
const MIME = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".mp3": "audio/mpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ttf": "font/ttf",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

function json(response, status, value) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(JSON.stringify(value));
}

async function readBody(request) {
  let body = "";
  for await (const chunk of request) {
    body += chunk;
    if (Buffer.byteLength(body) > MAX_BODY_BYTES) throw new Error("Request body is too large.");
  }
  return body;
}

export async function consumeCapture(
  id,
  directory = path.join(os.homedir(), "Library", "Application Support", "PhraseWeave", "captures"),
) {
  if (!CAPTURE_ID.test(id)) throw new Error("无效的选中文本请求。");
  const file = path.join(directory, `${id}.json`);
  const stat = await fs.stat(file);
  if (Date.now() - stat.mtimeMs > MAX_CAPTURE_AGE_MS || stat.size > MAX_BODY_BYTES) {
    await fs.rm(file, { force: true });
    throw new Error("选中文本已过期，请重新从浏览器导入。");
  }
  try {
    const record = JSON.parse(await fs.readFile(file, "utf8"));
    if (typeof record.text !== "string" || !record.text.trim() || record.text.length > 30_000) {
      throw new Error("选中文本无效。");
    }
    return record.text;
  } finally {
    await fs.rm(file, { force: true });
  }
}

async function staticFile(root, pathname, response) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    json(response, 400, { error: "Invalid path." });
    return;
  }
  const target = path.resolve(root, `.${decoded}`);
  if (target !== root && !target.startsWith(`${root}${path.sep}`)) {
    json(response, 400, { error: "Invalid path." });
    return;
  }
  const candidates =
    decoded === "/"
      ? [path.join(root, "index.html")]
      : [target, `${target}.html`, path.join(target, "index.html")];
  if (!path.extname(decoded)) candidates.push(path.join(root, "200.html"));
  for (const candidate of candidates) {
    try {
      const stat = await fs.stat(candidate);
      if (!stat.isFile()) continue;
      response.writeHead(200, {
        "Content-Type": MIME[path.extname(candidate)] || "application/octet-stream",
        "Content-Length": stat.size,
        "X-Content-Type-Options": "nosniff",
      });
      createReadStream(candidate).pipe(response);
      return;
    } catch (error) {
      if (error.code !== "ENOENT" && error.code !== "ENOTDIR") throw error;
    }
  }
  json(response, 404, { error: "Not found." });
}

export async function startPageServer({ clientRoot, runtime, port = 3000 }) {
  const server = http.createServer((request, response) => {
    void (async () => {
      const address = server.address();
      const origin = `http://127.0.0.1:${address.port}`;
      if (request.headers.host !== `127.0.0.1:${address.port}`) {
        json(response, 403, { error: "Invalid host." });
        return;
      }
      const url = new URL(request.url, origin);
      if (url.pathname.startsWith("/api/")) {
        if (
          request.headers["sec-fetch-site"] === "cross-site" ||
          (request.headers.origin && request.headers.origin !== origin)
        ) {
          json(response, 403, { error: "Invalid origin." });
          return;
        }
        if (request.method !== "GET" && request.headers.origin !== origin) {
          json(response, 403, { error: "Invalid origin." });
          return;
        }
        if (request.method === "GET" && url.pathname.startsWith("/api/captures/")) {
          try {
            json(response, 200, { text: await consumeCapture(url.pathname.slice(14)) });
          } catch (error) {
            json(response, 400, { error: error.message });
          }
          return;
        }
        if (request.method === "POST" && url.pathname === "/api/retry") {
          await runtime.restart();
          json(response, 200, { ok: true });
          return;
        }
        const valid =
          (request.method === "GET" && url.pathname === "/api/status") ||
          (request.method === "POST" && url.pathname === "/api/generate") ||
          ((request.method === "GET" || request.method === "DELETE") &&
            url.pathname.startsWith("/api/jobs/") &&
            JOB_ID.test(url.pathname.slice(10)));
        if (!valid) {
          json(response, 404, { error: "Not found." });
          return;
        }
        const body = request.method === "POST" ? await readBody(request) : undefined;
        let upstream;
        try {
          upstream = await runtime.request(url.pathname, request.method, body);
        } catch (error) {
          if (url.pathname === "/api/status") {
            json(response, 200, {
              runtimeReady: false,
              modelDownloaded: false,
              initialization: { state: "error", message: "生成引擎已停止", error: error.message },
            });
            return;
          }
          throw error;
        }
        response.writeHead(upstream.status, {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff",
        });
        response.end(await upstream.text());
        return;
      }
      if (request.method !== "GET" && request.method !== "HEAD") {
        json(response, 405, { error: "Method not allowed." });
        return;
      }
      await staticFile(clientRoot, url.pathname, response);
    })().catch((error) => {
      if (!response.headersSent) json(response, 503, { error: error.message });
      else response.destroy(error);
    });
  });

  try {
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(port, "127.0.0.1", resolve);
    });
  } catch (error) {
    if (error.code !== "EADDRINUSE" || port === 0) throw error;
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
  }
  const actualPort = server.address().port;
  return { server, url: `http://127.0.0.1:${actualPort}/` };
}
