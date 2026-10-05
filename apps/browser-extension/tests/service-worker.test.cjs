const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { runInNewContext } = require("node:vm");
const { test } = require("node:test");

async function click({ text = "The cat sleeps.", error } = {}) {
  let onClicked;
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
      sendNativeMessage() {
        throw new Error("Native Messaging must not be used");
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
        if (error) throw new Error(error);
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
  runInNewContext(readFileSync(join(__dirname, "../service-worker.js"), "utf8"), {
    chrome,
    URL,
    URLSearchParams,
    TextEncoder,
    btoa,
  });
  onClicked({ menuItemId: "phraseweave-practice-web", selectionText: text });
  await done;
  return { tab, notification };
}

test("selection opens the fixed Web UI using a fragment and no native host", async () => {
  for (const text of [
    "The cat sleeps.",
    "English & 中文 + 100% = # ?\nsecond line",
    "猫".repeat(30000),
  ]) {
    const { tab, notification } = await click({ text });
    const url = new URL(tab.url);
    assert.equal(url.origin, "http://127.0.0.1:3000");
    assert.equal(url.pathname, "/generator");
    assert.equal(url.search, "");
    const encodedText = new URLSearchParams(url.hash.slice(1)).get("text");
    assert.match(encodedText, /^[A-Za-z0-9_-]+$/);
    assert.equal(Buffer.from(encodedText, "base64url").toString("utf8"), text);
    assert.equal(tab.active, true);
    assert.equal(notification, undefined);
  }
});

test("invalid selections produce a notification without opening a tab", async () => {
  for (const text of ["", "  ", "a".repeat(30001)]) {
    const { tab, notification } = await click({ text });
    assert.equal(tab, undefined);
    assert.match(notification.message, /30,000/);
  }
});

test("tab creation failures are shown as a notification", async () => {
  const { tab, notification } = await click({ error: "Unable to create tab" });
  assert.equal(tab, undefined);
  assert.equal(notification.message, "Unable to create tab");
});

test("manifest does not request native messaging or local HTTP access", () => {
  const manifest = JSON.parse(readFileSync(join(__dirname, "../manifest.json"), "utf8"));
  assert.equal(manifest.permissions.includes("nativeMessaging"), false);
  assert.equal(manifest.host_permissions, undefined);
});
