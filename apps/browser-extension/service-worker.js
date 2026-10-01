const WEB_MENU_ID = "phraseweave-practice-web";
const DESKTOP_MENU_ID = "phraseweave-practice-desktop";
const NATIVE_HOST = "com.phraseweave.capture";
const STORAGE_PREFIX = "capture:";
const CAPTURE_TTL_MS = 10 * 60 * 1000;

chrome.runtime.onInstalled.addListener(() => {
  void chrome.storage.session.clear();
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: WEB_MENU_ID,
      title: "导入 PhraseWeave 网页版",
      contexts: ["selection"],
    });
    chrome.contextMenus.create({
      id: DESKTOP_MENU_ID,
      title: "导入 PhraseWeave 桌面版",
      contexts: ["selection"],
    });
  });
});

chrome.contextMenus.onClicked.addListener((info) => {
  if (info.menuItemId === WEB_MENU_ID) void openCapture(info.selectionText || "");
  if (info.menuItemId === DESKTOP_MENU_ID) void openDesktopCapture(info.selectionText || "");
});

async function openDesktopCapture(selectedText) {
  try {
    const result = await chrome.runtime.sendNativeMessage(NATIVE_HOST, {
      type: "capture",
      text: selectedText,
    });
    if (!result?.ok) throw new Error(result?.error || "桌面应用未能接收选中文本");
  } catch (error) {
    await chrome.notifications.create({
      type: "basic",
      iconUrl: chrome.runtime.getURL("icon.png"),
      title: "PhraseWeave 桌面导入失败",
      message: error?.message || "请确认桌面应用已经安装，然后重试。",
    });
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (
    message?.type !== "PHRASEWEAVE_CLAIM_CAPTURE" &&
    message?.type !== "PHRASEWEAVE_ACK_CAPTURE"
  ) {
    return undefined;
  }

  void handleCaptureMessage(message, sender)
    .then(sendResponse)
    .catch((error) =>
      sendResponse({ ok: false, error: error.message || "Capture handoff failed." }),
    );
  return true;
});

async function openCapture(selectedText) {
  await removeExpiredCaptures();
  const requestId = crypto.randomUUID().replaceAll("-", "");
  const tab = await chrome.tabs.create({ url: "about:blank", active: true });
  if (typeof tab.id !== "number") return;

  const key = `${STORAGE_PREFIX}${requestId}`;
  await chrome.storage.session.set({
    [key]: {
      requestId,
      selectedText,
      tabId: tab.id,
      expiresAt: Date.now() + CAPTURE_TTL_MS,
    },
  });

  const target = new URL("https://reinerlau.github.io/phraseweave/generator");
  target.searchParams.set("capture", requestId);
  await chrome.tabs.update(tab.id, { url: target.toString() });
}

async function removeExpiredCaptures() {
  const stored = await chrome.storage.session.get(null);
  const expiredKeys = Object.entries(stored)
    .filter(([key, value]) => key.startsWith(STORAGE_PREFIX) && value.expiresAt < Date.now())
    .map(([key]) => key);
  if (expiredKeys.length) await chrome.storage.session.remove(expiredKeys);
}

async function handleCaptureMessage(message, sender) {
  const requestId = message.requestId;
  const senderTabId = sender.tab?.id;
  const senderUrl = sender.url || sender.tab?.url || "";
  if (
    typeof requestId !== "string" ||
    typeof senderTabId !== "number" ||
    !isGeneratorUrl(senderUrl, requestId)
  ) {
    return { ok: false };
  }

  const key = `${STORAGE_PREFIX}${requestId}`;
  const stored = (await chrome.storage.session.get(key))[key];
  if (!stored || stored.tabId !== senderTabId || stored.expiresAt < Date.now()) {
    if (stored) await chrome.storage.session.remove(key);
    return { ok: false };
  }

  if (message.type === "PHRASEWEAVE_ACK_CAPTURE") {
    await chrome.storage.session.remove(key);
    return { ok: true };
  }

  return { ok: true, text: stored.selectedText };
}

function isGeneratorUrl(value, requestId) {
  try {
    const url = new URL(value);
    const allowedOrigin =
      url.origin === "https://reinerlau.github.io" ||
      url.origin === "http://localhost:3000" ||
      url.origin === "http://127.0.0.1:3000";
    const pathname = url.pathname.endsWith("/") ? url.pathname.slice(0, -1) : url.pathname;
    const correctPath =
      url.origin === "https://reinerlau.github.io"
        ? pathname === "/phraseweave/generator"
        : pathname === "/generator";
    return allowedOrigin && correctPath && url.searchParams.get("capture") === requestId;
  } catch {
    return false;
  }
}
