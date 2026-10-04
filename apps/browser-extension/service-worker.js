const MENU_ID = "phraseweave-practice-desktop";
const NATIVE_HOST = "com.phraseweave.capture";

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: MENU_ID,
      title: "导入 PhraseWeave",
      contexts: ["selection"],
    });
  });
});

chrome.contextMenus.onClicked.addListener((info) => {
  if (info.menuItemId !== MENU_ID) return;
  void chrome.runtime
    .sendNativeMessage(NATIVE_HOST, { type: "capture", text: info.selectionText || "" })
    .then((result) => {
      if (!result?.ok) throw new Error(result?.error || "PhraseWeave 未能接收选中文本");
    })
    .catch((error) =>
      chrome.notifications.create({
        type: "basic",
        iconUrl: chrome.runtime.getURL("icon.png"),
        title: "PhraseWeave 导入失败",
        message: error?.message || "请确认 PhraseWeave 已安装，然后重试。",
      }),
    );
});
