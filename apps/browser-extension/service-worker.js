chrome.runtime.onInstalled.addListener(() => chrome.contextMenus.removeAll());
chrome.runtime.onStartup.addListener(() => chrome.contextMenus.removeAll());
