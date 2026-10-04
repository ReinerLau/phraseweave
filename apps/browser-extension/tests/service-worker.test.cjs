const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { runInNewContext } = require("node:vm");
const { test } = require("node:test");

test("desktop selection goes to the native host without opening the website", async () => {
  let onClicked;
  let received;
  let resolveMessage;
  const sent = new Promise((resolve) => {
    resolveMessage = resolve;
  });
  const chrome = {
    runtime: {
      onInstalled: { addListener() {} },
      onMessage: { addListener() {} },
      async sendNativeMessage(host, message) {
        received = { host, message };
        resolveMessage();
        return { ok: true };
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
      create() {
        throw new Error("website tab should not open");
      },
    },
  };
  const source = readFileSync(join(__dirname, "../service-worker.js"), "utf8");
  runInNewContext(source, { chrome, URL, Date, crypto });

  onClicked({ menuItemId: "phraseweave-practice-desktop", selectionText: "The cat sleeps." });
  await sent;
  assert.equal(received.host, "com.phraseweave.capture");
  assert.equal(received.message.text, "The cat sleeps.");
});
