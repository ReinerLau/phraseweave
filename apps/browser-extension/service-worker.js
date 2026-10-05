const MENU_ID = "phraseweave-practice-web";
const NATIVE_HOST = "com.phraseweave.webcapture";

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
    .then(async (result) => {
      if (!result?.ok) throw new Error(result?.error || "PhraseWeave 未能接收选中文本");
      const url = new URL(result.url);
      if (
        url.protocol !== "http:" ||
        url.hostname !== "127.0.0.1" ||
        url.username ||
        url.password ||
        url.pathname !== "/generator" ||
        !/^[a-f0-9]{32}$/.test(url.searchParams.get("capture") || "") ||
        [...url.searchParams.keys()].some((key) => key !== "capture") ||
        url.hash
      )
        throw new Error("本机服务返回了无效的 Web UI 地址。");
      await chrome.tabs.create({ url: url.toString(), active: true });
    })
    .catch((error) =>
      chrome.notifications.create({
        type: "basic",
        iconUrl: chrome.runtime.getURL("icon.png"),
        title: "PhraseWeave 导入失败",
        message: /native messaging host|host not found|not registered/i.test(error?.message || "")
          ? "请先执行 phraseweave extension install，重新加载扩展后再试。"
          : error?.message || "请先执行 phraseweave extension install，并运行 phraseweave 后重试。",
      }),
    );
});
