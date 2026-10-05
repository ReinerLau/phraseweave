const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { runInNewContext } = require("node:vm");
const { test } = require("node:test");

const URL_VALUE = "http://127.0.0.1:43219/generator?capture=0123456789abcdef0123456789abcdef";

async function click({ result = { ok: true, url: URL_VALUE }, error } = {}) {
  let onClicked;
  let received;
  let tab;
  let notification;
  let complete;
  const done = new Promise((resolve) => {
    complete = resolve;
  });
  const chrome = {
    runtime: {
      onInstalled: { addListener() {} },
      getURL: (value) => value,
      async sendNativeMessage(host, message) {
        received = { host, message };
        if (error) throw new Error(error);
        return result;
      },
    },
    contextMenus: {
      onClicked: {
        addListener(listener) {
          onClicked = listener;
        },
      },
    },
    tabs: {
      async create(value) {
        tab = value;
        complete();
      },
    },
    notifications: {
      create(value) {
        notification = value;
        complete();
      },
    },
  };
  runInNewContext(readFileSync(join(__dirname, "../service-worker.js"), "utf8"), { chrome, URL });
  onClicked({ menuItemId: "phraseweave-practice-web", selectionText: "The cat sleeps." });
  await done;
  return { received, tab, notification };
}

test("selection opens the returned local Web UI in an active tab", async () => {
  const { received, tab, notification } = await click();
  assert.equal(received.host, "com.phraseweave.webcapture");
  assert.equal(received.message.type, "capture");
  assert.equal(received.message.text, "The cat sleeps.");
  assert.equal(tab.url, URL_VALUE);
  assert.equal(tab.active, true);
  assert.equal(notification, undefined);
});

test("missing registration explains CLI installation", async () => {
  const { tab, notification } = await click({
    error: "Specified native messaging host not found.",
  });
  assert.equal(tab, undefined);
  assert.match(notification.message, /phraseweave extension install/);
});

test("service failure preserves the host's actionable instruction", async () => {
  const error = "请先在终端运行并保持 phraseweave，再重试导入。";
  const { tab, notification } = await click({ result: { ok: false, error } });
  assert.equal(tab, undefined);
  assert.equal(notification.message, error);
});

test("untrusted host URLs cannot open a browser tab", async () => {
  for (const url of [
    URL_VALUE.replace("http:", "https:"),
    URL_VALUE.replace("127.0.0.1", "example.com"),
    URL_VALUE.replace("127.0.0.1", "user@127.0.0.1"),
    URL_VALUE + "&text=selected",
    URL_VALUE + "#text",
    URL_VALUE.replace("/generator", "/game"),
    URL_VALUE.replace(/capture=.*/, "capture=invalid"),
  ]) {
    const { tab, notification } = await click({ result: { ok: true, url } });
    assert.equal(tab, undefined);
    assert.match(notification.message, /无效/);
  }
});
