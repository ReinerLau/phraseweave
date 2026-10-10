import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { after, afterEach, before, beforeEach, test } from "node:test";

import { savePassword } from "../bin/remote-auth.mjs";
import { safeReturnPath, startRemoteServer } from "../bin/remote-server.mjs";
import { startPageServer } from "../bin/server.mjs";

const config = {
  origin: "https://phraseweave.example.com",
  username: "phraseweave",
  auth: "password",
};
const password = "test-password-only-123";
let root, authFile, originalAuth, local, gateway, time, calls;

const get = (pathname, init = {}) =>
  fetch(new URL(pathname, gateway.url), { redirect: "manual", ...init });
const sessionCookie = (response) => response.headers.get("set-cookie").split(";")[0];
const login = (
  extra = {},
  candidate = password,
  username = config.username,
  returnTo = "/generator?example=1",
) =>
  get("/remote/login", {
    method: "POST",
    headers: {
      Origin: config.origin,
      "Content-Type": "application/x-www-form-urlencoded",
      ...extra,
    },
    body: new URLSearchParams({ username, password: candidate, returnTo }),
  });

before(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "phraseweave-remote-"));
  authFile = path.join(root, "auth.json");
  await savePassword(config.username, password, authFile);
  originalAuth = await fs.readFile(authFile);
  await fs.writeFile(path.join(root, "index.html"), "<h1>Private practice</h1>");
  await fs.writeFile(path.join(root, "200.html"), "<h1>Private route</h1>");
  await fs.writeFile(path.join(root, "audio.mp3"), "private-audio");
  await fs.writeFile(path.join(root, "app.js"), "private-script");
  local = await startPageServer({
    clientRoot: root,
    port: 0,
    remoteOrigin: config.origin,
    runtime: {
      request: async (...args) => {
        calls.push(args);
        return new Response(JSON.stringify({ ok: true }));
      },
    },
  });
});

beforeEach(async () => {
  calls = [];
  time = Date.now();
  await fs.writeFile(authFile, originalAuth);
  gateway = await startRemoteServer({ config, localUrl: local.url, authFile, now: () => time });
});

afterEach(async () => {
  gateway.server.closeAllConnections();
  await new Promise((resolve) => gateway.server.close(resolve));
});

after(async () => {
  local.server.closeAllConnections();
  await new Promise((resolve) => local.server.close(resolve));
  await fs.rm(root, { recursive: true, force: true });
});

test("requires login for pages, static assets, audio, and APIs while leaving local access unchanged", async () => {
  for (const resource of ["/", "/game/example", "/audio.mp3", "/app.js"]) {
    const response = await get(resource);
    assert.equal(response.status, 303);
    assert.match(response.headers.get("location"), /^\/remote\/login\?returnTo=/);
    assert.doesNotMatch(await response.text(), /private/i);
  }
  for (const resource of ["/api/status", "/api/local-exercises", "/remote/session"]) {
    const response = await get(resource);
    assert.equal(response.status, 401);
    assert.equal((await response.json()).code, "REMOTE_AUTH_REQUIRED");
  }
  assert.equal((await fetch(local.url)).status, 200);
  assert.equal(calls.length, 0);
});

test("login issues a session cookie and proxies routes, audio, and shared data through the local Host", async () => {
  const response = await login();
  assert.equal(response.status, 303);
  assert.equal(response.headers.get("location"), "/generator?example=1");
  const setCookie = response.headers.get("set-cookie");
  assert.match(setCookie, /^__Host-phraseweave_remote=[0-9a-f]{64};/);
  assert.match(setCookie, /Secure; HttpOnly; SameSite=Strict/);
  assert.doesNotMatch(setCookie, /Max-Age|Expires/i);
  const headers = { Cookie: sessionCookie(response) };
  assert.deepEqual(await (await get("/remote/session", { headers })).json(), {
    username: config.username,
  });
  assert.match(await (await get("/game/example", { headers })).text(), /Private route/);
  assert.equal(await (await get("/audio.mp3", { headers })).text(), "private-audio");
  const asset = await get("/app.js", { headers });
  assert.equal(asset.headers.get("cache-control"), "no-store");
  assert.equal(await asset.text(), "private-script");
  const generated = await get("/api/generate", {
    method: "POST",
    headers: { ...headers, Origin: config.origin, "Content-Type": "application/json" },
    body: '{"text":"Example"}',
  });
  assert.equal(generated.status, 200);
  assert.deepEqual(calls.at(-1), ["/api/generate", "POST", '{"text":"Example"}']);
  const progress = await get("/api/local-exercises/pack/progress", {
    method: "PUT",
    headers: { ...headers, Origin: config.origin, "Content-Type": "application/json" },
    body: '{"progress":1}',
  });
  assert.equal(progress.status, 200);
  assert.equal(calls.at(-1)[0], "/api/local-exercises/pack/progress");
});

test("rejects forged Hosts and cross-origin login, logout, and API requests", async () => {
  assert.equal((await login({ Origin: "https://evil.example" })).status, 403);
  assert.equal((await login({ Origin: "" })).status, 403);
  const headers = { Cookie: sessionCookie(await login()), Origin: config.origin };
  assert.equal(
    (
      await get("/remote/logout", {
        method: "POST",
        headers: { ...headers, Origin: "https://evil.example" },
      })
    ).status,
    403,
  );
  assert.equal(
    (await get("/api/status", { headers: { ...headers, "Sec-Fetch-Site": "cross-site" } })).status,
    403,
  );
  assert.equal(
    (
      await get("/api/generate", {
        method: "POST",
        headers: { ...headers, Origin: "https://evil.example" },
        body: "{}",
      })
    ).status,
    403,
  );
  assert.equal((await get("/remote/session", { headers })).status, 200);
  const status = await new Promise((resolve, reject) => {
    http
      .get(gateway.url, { headers: { Host: "evil.example" } }, (response) => {
        response.resume();
        resolve(response.statusCode);
      })
      .on("error", reject);
  });
  assert.equal(status, 403);
  // Opening a bookmarked link from another website must still reach the login page.
  assert.equal((await get("/", { headers: { "Sec-Fetch-Site": "cross-site" } })).status, 303);
});

test("logout and the 24-hour deadline invalidate sessions", async () => {
  const headers = { Cookie: sessionCookie(await login()), Origin: config.origin };
  assert.equal((await get("/remote/logout", { headers })).status, 405);
  const loggedOut = await get("/remote/logout", { method: "POST", headers });
  assert.equal(loggedOut.status, 303);
  assert.match(loggedOut.headers.get("set-cookie"), /Max-Age=0/);
  assert.equal((await get("/api/status", { headers })).status, 401);
  const fresh = { Cookie: sessionCookie(await login()) };
  time += 24 * 60 * 60_000;
  assert.equal((await get("/api/status", { headers: fresh })).status, 401);
});

test("password resets invalidate sessions immediately and corrupt credentials fail closed", async () => {
  const headers = { Cookie: sessionCookie(await login()) };
  await savePassword(config.username, "replacement-password-456", authFile);
  assert.equal((await get("/api/status", { headers })).status, 401);
  assert.equal((await login({}, password)).status, 401);
  const fresh = { Cookie: sessionCookie(await login({}, "replacement-password-456")) };
  assert.equal((await get("/api/status", { headers: fresh })).status, 200);
  await fs.writeFile(authFile, "broken");
  assert.equal((await get("/audio.mp3", { headers: fresh })).status, 503);
  assert.equal((await get("/remote/login")).status, 503);
  await fs.writeFile(authFile, originalAuth);
  assert.equal((await get("/api/status", { headers: fresh })).status, 401);
  await assert.rejects(
    startRemoteServer({ config, localUrl: local.url, authFile: path.join(root, "missing") }),
    /缺失或损坏/,
  );
});

test("incorrect accounts and passwords share one error and are rate limited", async () => {
  const headers = { "CF-Connecting-IP": "203.0.113.1" };
  for (let index = 0; index < 5; index += 1) {
    const response = await login(
      headers,
      index % 2 ? password : "wrong-password",
      index % 2 ? "unknown" : config.username,
    );
    assert.equal(response.status, 401);
    assert.match(await response.text(), /用户名或密码错误/);
  }
  const blocked = await login(headers);
  assert.equal(blocked.status, 429);
  assert.ok(Number(blocked.headers.get("retry-after")) > 0);
  assert.equal((await login({ "CF-Connecting-IP": "203.0.113.2" })).status, 303);
  time += 10 * 60_000;
  assert.equal((await login(headers)).status, 303);
});

test("session tokens do not survive a gateway restart", async () => {
  const headers = { Cookie: sessionCookie(await login()) };
  gateway.server.closeAllConnections();
  await new Promise((resolve) => gateway.server.close(resolve));
  gateway = await startRemoteServer({ config, localUrl: local.url, authFile });
  assert.equal((await get("/api/status", { headers })).status, 401);
});

test("return paths cannot redirect to another origin or loop through auth endpoints", async () => {
  for (const value of [
    "https://evil.example",
    "//evil.example",
    "/\\evil.example",
    "/remote/login",
    "/remote/logout",
    "/\nheader",
  ])
    assert.equal(safeReturnPath(value, config.origin), "/");
  const response = await login({}, password, config.username, "//evil.example");
  assert.equal(response.headers.get("location"), "/");
  assert.equal(
    safeReturnPath("/game/1?mode=review#unit", config.origin),
    "/game/1?mode=review#unit",
  );
});
