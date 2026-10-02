const path = require("node:path");

const { app, BrowserWindow, session, shell } = require("electron");
const { installOrUpdate, startPackage, stopPackage } = require("./package-launcher.cjs");

const CAPTURE_ID = /^[a-f0-9]{32}$/;
let mainWindow;
let pageUrl;
let packageProcess;
let startPromise;
let pendingCaptureId;
let shuttingDown = false;

app.setName("PhraseWeave");

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

function destination() {
  const url = new URL(pendingCaptureId ? `/generator?capture=${pendingCaptureId}` : "/", pageUrl);
  pendingCaptureId = undefined;
  return url.toString();
}

function openCaptureUrl(value) {
  const id = captureIdFromUrl(value);
  if (!id) return;
  pendingCaptureId = id;
  if (!app.isReady()) return;
  if (!mainWindow) createWindow();
  mainWindow.show();
  mainWindow.focus();
  if (pageUrl) void mainWindow.loadURL(destination());
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

function showProgress(message) {
  if (!mainWindow || pageUrl) return;
  const code = `document.getElementById("status").textContent = ${JSON.stringify(message)}`;
  void mainWindow.webContents.executeJavaScript(code).catch(() => {});
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 850,
    minWidth: 760,
    minHeight: 540,
    title: "PhraseWeave",
    webPreferences: {
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
    if (pageUrl && new URL(url).origin === new URL(pageUrl).origin) return;
    event.preventDefault();
    if (url.startsWith("https://")) void shell.openExternal(url);
  });
  mainWindow.on("closed", () => {
    mainWindow = undefined;
  });
  if (pageUrl) void mainWindow.loadURL(destination());
  else {
    void mainWindow.loadFile(path.join(__dirname, "launcher.html"));
    void ensureStarted();
  }
}

function ensureStarted() {
  if (startPromise) return startPromise;
  startPromise = (async () => {
    showProgress("正在检查 GitHub Packages 更新…");
    const installation = await installOrUpdate(showProgress, {
      developmentRoot: app.isPackaged ? undefined : process.env.PHRASEWEAVE_CLI_ROOT,
    });
    showProgress("正在启动本地页面与生成服务…");
    const started = await startPackage(installation, showProgress);
    packageProcess = started.child;
    pageUrl = started.url;
    started.child.on("exit", () => {
      if (shuttingDown || packageProcess !== started.child) return;
      packageProcess = undefined;
      pageUrl = undefined;
      startPromise = undefined;
      if (mainWindow) {
        void mainWindow.loadFile(path.join(__dirname, "launcher.html")).then(() => {
          showProgress("本地服务已停止。请退出并重新打开 PhraseWeave。");
        });
      }
    });
    if (mainWindow) await mainWindow.loadURL(destination());
  })().catch(async (error) => {
    stopPackage(packageProcess);
    packageProcess = undefined;
    pageUrl = undefined;
    startPromise = undefined;
    if (mainWindow) await mainWindow.loadFile(path.join(__dirname, "launcher.html"));
    showProgress(
      `启动失败：${error.message}\n请确认 Node/npm 已安装，并先在终端登录 GitHub Packages。`,
    );
  });
  return startPromise;
}

app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((_contents, permission, callback) => {
    callback(permission === "clipboard-sanitized-write" || permission === "clipboard-write");
  });
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("before-quit", () => {
  shuttingDown = true;
  stopPackage(packageProcess);
});
