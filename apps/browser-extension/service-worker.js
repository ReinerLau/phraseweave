const MENU_ID = "phraseweave-practice-web";
const GENERATOR_URL = "http://127.0.0.1:3000/generator";

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: MENU_ID,
      title: "导入 PhraseWeave",
      contexts: ["selection"],
    });
  });
});

function notifyError(message) {
  chrome.notifications.create({
    type: "basic",
    iconUrl: chrome.runtime.getURL("icon.png"),
    title: "PhraseWeave 导入失败",
    message,
  });
}

chrome.contextMenus.onClicked.addListener((info) => {
  if (info.menuItemId !== MENU_ID) return;
  const text = info.selectionText || "";
  if (!text.trim() || text.length > 30000) {
    notifyError("请选择 1 至 30,000 个字符后重试。");
    return;
  }
  const url = new URL(GENERATOR_URL);
  const encodedText = btoa(
    Array.from(new TextEncoder().encode(text), (byte) => String.fromCharCode(byte)).join(""),
  )
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
  url.hash = new URLSearchParams({ text: encodedText }).toString();
  void chrome.tabs
    .create({ url: url.toString(), active: true })
    .catch((error) => notifyError(error?.message || "无法打开 PhraseWeave Web UI，请重试。"));
});
