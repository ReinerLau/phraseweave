const { spawn } = require("node:child_process");
const { randomBytes } = require("node:crypto");
const fs = require("node:fs");
const fsPromises = require("node:fs/promises");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const { app, BrowserWindow, ipcMain, net, protocol, session, shell } = require("electron");

const APP_ORIGIN = "phraseweave-app://app";
const CAPTURE_ID = /^[a-f0-9]{32}$/;
const JOB_ID = /^[a-f0-9]{32}$/;
const CAPTURE_MAX_AGE_MS = 10 * 60 * 1000;

app.setName("PhraseWeave");
protocol.registerSchemesAsPrivileged([
  {
    scheme: "phraseweave-app",
    privileges: { standard: true, secure: true, supportFetchAPI: true },
  },
]);

let mainWindow;
let runtimeProcess;
let runtimeStart;
let runtimePort;
let runtimeToken;
let runtimeError = "";
const pendingCaptureIds = [];

function captureIdFromUrl(value) {
  try {
    const url = new URL(value);
    const id = url.pathname.slice(1);
    return url.protocol === "phraseweave:" && url.hostname === "capture" && CAPTURE_ID.test(id)
      ? id
      : undefined;
  } catch {
    return undefined;
  }
}

function openCaptureUrl(value) {
  const id = captureIdFromUrl(value);
  if (!id) return;
  if (!app.isReady()) {
    pendingCaptureIds.push(id);
    return;
  }
  if (!mainWindow) {
    pendingCaptureIds.push(id);
    createWindow();
    return;
  }
  mainWindow.show();
  mainWindow.focus();
  void mainWindow.loadURL(`${APP_ORIGIN}/generator?capture=${id}`);
}

app.on("open-url", (event, url) => {
  event.preventDefault();
  openCaptureUrl(url);
});

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", (_event, argv) => {
    const link = argv.find((arg) => arg.startsWith("phraseweave://"));
    if (link) openCaptureUrl(link);
    else mainWindow?.focus();
  });
}

function clientRoot() {
  return app.isPackaged
    ? path.join(process.resourcesPath, "client")
    : path.join(__dirname, ".build", "client");
}

function serveClient(request) {
  const url = new URL(request.url);
  if (url.hostname !== "app") return new Response("Not found", { status: 404 });
  const root = clientRoot();
  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    return new Response("Bad path", { status: 400 });
  }
  const target = path.resolve(root, `.${pathname}`);
  if (target !== root && !target.startsWith(`${root}${path.sep}`)) {
    return new Response("Bad path", { status: 400 });
  }
  const candidates = pathname === "/"
    ? [path.join(root, "index.html")]
    : [target, `${target}.html`, path.join(target, "index.html")];
  const file = candidates.find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile()) ||
    (path.extname(pathname) ? undefined : path.join(root, "200.html"));
  if (!file || !fs.existsSync(file)) return new Response("Not found", { status: 404 });
  return net.fetch(pathToFileURL(file).toString());
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 850,
    minWidth: 760,
    minHeight: 540,
    title: "PhraseWeave",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
    },
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://")) void shell.openExternal(url);
    return { action: "deny" };
  });
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith(`${APP_ORIGIN}/`)) {
      event.preventDefault();
      if (url.startsWith("https://")) void shell.openExternal(url);
    }
  });
  mainWindow.on("closed", () => {
    mainWindow = undefined;
  });
  const captureId = pendingCaptureIds.pop();
  pendingCaptureIds.length = 0;
  void mainWindow.loadURL(captureId ? `${APP_ORIGIN}/generator?capture=${captureId}` : `${APP_ORIGIN}/`);
}

function runtimeCommand() {
  if (app.isPackaged) {
    return {
      command: path.join(process.resourcesPath, "phraseweave-runtime", "phraseweave-runtime"),
      args: ["--service"],
    };
  }
  return {
    command: "python3",
    args: [path.join(__dirname, "../../tools/lexical_chunks/desktop_runtime.py"), "--service"],
  };
}

function ensureRuntime() {
  if (runtimeStart) return runtimeStart;
  runtimeToken = randomBytes(32).toString("hex");
  runtimeError = "";
  const { command, args } = runtimeCommand();
  runtimeStart = new Promise((resolve, reject) => {
    let ready = false;
    let stdout = "";
    const child = spawn(command, args, {
      cwd: app.isPackaged ? process.resourcesPath : path.join(__dirname, "../../tools/lexical_chunks"),
      env: {
        ...process.env,
        PHRASEWEAVE_DESKTOP_TOKEN: runtimeToken,
        PHRASEWEAVE_GENERATOR_PORT: "8765",
      },
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    runtimeProcess = child;
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
      const lines = stdout.split("\n");
      stdout = lines.pop() || "";
      for (const line of lines) {
        try {
          const record = JSON.parse(line);
          if (record.type === "ready" && Number.isInteger(record.port)) {
            runtimePort = record.port;
            ready = true;
            resolve();
          }
        } catch {
          // Initialization progress is available through /api/status.
        }
      }
    });
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => {
      runtimeError = String(chunk).slice(-1000);
    });
    child.on("error", (error) => {
      runtimeError = error.message;
      if (!ready) reject(error);
    });
    child.on("exit", (code) => {
      if (runtimeProcess === child) {
        runtimeProcess = undefined;
        runtimePort = undefined;
        runtimeStart = undefined;
      }
      if (!ready) reject(new Error(runtimeError || `Generator exited (${code}).`));
      runtimeError ||= `Generator exited (${code}).`;
    });
  });
  return runtimeStart;
}

function stopRuntime() {
  if (runtimeProcess?.pid) {
    try {
      process.kill(-runtimeProcess.pid, "SIGTERM");
    } catch {
      runtimeProcess.kill();
    }
  }
  runtimeProcess = undefined;
  runtimePort = undefined;
  runtimeStart = undefined;
}

async function runtimeRequest(endpoint, method = "GET", payload) {
  await ensureRuntime();
  const response = await fetch(`http://127.0.0.1:${runtimePort}${endpoint}`, {
    method,
    headers: {
      Authorization: `Bearer ${runtimeToken}`,
      ...(payload === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: payload === undefined ? undefined : JSON.stringify(payload),
    signal: AbortSignal.timeout(30_000),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || `Generator returned ${response.status}.`);
  return result;
}

function assertAppFrame(event) {
  if (
    !mainWindow ||
    event.sender.id !== mainWindow.webContents.id ||
    event.senderFrame !== mainWindow.webContents.mainFrame ||
    !event.senderFrame.url.startsWith(`${APP_ORIGIN}/`)
  ) {
    throw new Error("Invalid app frame.");
  }
}

async function consumeCapture(id) {
  if (!CAPTURE_ID.test(id)) throw new Error("无效的选中文本请求。");
  const file = path.join(app.getPath("appData"), "PhraseWeave", "captures", `${id}.json`);
  const stat = await fsPromises.stat(file);
  if (Date.now() - stat.mtimeMs > CAPTURE_MAX_AGE_MS || stat.size > 120_000) {
    await fsPromises.unlink(file);
    throw new Error("选中文本已过期，请重新从浏览器导入。");
  }
  try {
    const record = JSON.parse(await fsPromises.readFile(file, "utf8"));
    if (typeof record.text !== "string" || !record.text.trim() || record.text.length > 30_000) {
      throw new Error("选中文本无效。");
    }
    return record.text;
  } finally {
    await fsPromises.unlink(file);
  }
}

function registerHandlers() {
  ipcMain.handle("generator:status", async (event) => {
    assertAppFrame(event);
    try {
      return await runtimeRequest("/api/status");
    } catch (error) {
      return {
        runtimeReady: false,
        modelDownloaded: false,
        initialization: { state: "error", message: "生成引擎启动失败", error: error.message },
      };
    }
  });
  ipcMain.handle("generator:start", async (event, payload) => {
    assertAppFrame(event);
    if (
      typeof payload?.text !== "string" ||
      payload.text.length > 30_000 ||
      !payload.text.trim() ||
      !["standard", "review"].includes(payload.mode) ||
      !["markdown", "phraseweave", "both"].includes(payload.format)
    ) {
      throw new Error("无效的生成请求。");
    }
    return runtimeRequest("/api/generate", "POST", payload);
  });
  ipcMain.handle("generator:job", async (event, id) => {
    assertAppFrame(event);
    if (!JOB_ID.test(id)) throw new Error("无效的任务编号。");
    return runtimeRequest(`/api/jobs/${id}`);
  });
  ipcMain.handle("generator:release", async (event, id) => {
    assertAppFrame(event);
    if (!JOB_ID.test(id)) throw new Error("无效的任务编号。");
    await runtimeRequest(`/api/jobs/${id}`, "DELETE");
  });
  ipcMain.handle("generator:retry", async (event) => {
    assertAppFrame(event);
    stopRuntime();
    runtimeError = "";
    await ensureRuntime();
  });
  ipcMain.handle("capture:consume", async (event, id) => {
    assertAppFrame(event);
    return consumeCapture(id);
  });
}

app.whenReady().then(() => {
  protocol.handle("phraseweave-app", serveClient);
  session.defaultSession.setPermissionRequestHandler((_contents, permission, callback) => {
    callback(permission === "clipboard-sanitized-write" || permission === "clipboard-write");
  });
  registerHandlers();
  createWindow();
  void ensureRuntime().catch(() => {});
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("before-quit", stopRuntime);
