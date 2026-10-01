const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { runInNewContext } = require("node:vm");
const { test } = require("node:test");

test("claims a capture after GitHub Pages adds a trailing slash", async () => {
  let onMessage;
  const requestId = "0123456789abcdef0123456789abcdef";
  const record = {
    requestId,
    selectedText: "A sentence to practice.",
    tabId: 42,
    expiresAt: Date.now() + 60_000,
  };
  const chrome = {
    runtime: {
      onInstalled: { addListener() {} },
      onMessage: {
        addListener(listener) {
          onMessage = listener;
        },
      },
    },
    contextMenus: {
      onClicked: { addListener() {} },
    },
    storage: {
      session: {
        async get(key) {
          return { [key]: record };
        },
        async remove() {},
      },
    },
  };
  const source = readFileSync(join(__dirname, "../service-worker.js"), "utf8");
  runInNewContext(source, {
    chrome,
    URL,
    Date,
    crypto: {
      randomUUID() {
        return requestId;
      },
    },
  });

  const result = await new Promise((resolve) => {
    const keepChannelOpen = onMessage(
      { type: "PHRASEWEAVE_CLAIM_CAPTURE", requestId },
      {
        tab: { id: 42 },
        url: `https://reinerlau.github.io/phraseweave/generator/?capture=${requestId}`,
      },
      resolve,
    );
    assert.equal(keepChannelOpen, true);
  });

  assert.equal(result.ok, true);
  assert.equal(result.text, record.selectedText);
});

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
      onClicked: { addListener(listener) { onClicked = listener; } },
    },
    tabs: {
      create() { throw new Error("website tab should not open"); },
    },
  };
  const source = readFileSync(join(__dirname, "../service-worker.js"), "utf8");
  runInNewContext(source, { chrome, URL, Date, crypto });

  onClicked({ menuItemId: "phraseweave-practice-desktop", selectionText: "The cat sleeps." });
  await sent;
  assert.equal(received.host, "com.phraseweave.capture");
  assert.equal(received.message.text, "The cat sleeps.");
});
