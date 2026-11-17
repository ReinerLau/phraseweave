const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { runInNewContext } = require("node:vm");
const { test } = require("node:test");
test("retired extension clears old menus on install and startup", () => {
  let removed = 0;
  const register = { addListener: (handler) => handler() };
  runInNewContext(readFileSync(require.resolve("../service-worker.js"), "utf8"), {
    chrome: {
      runtime: { onInstalled: register, onStartup: register },
      contextMenus: { removeAll: () => removed++ },
    },
  });
  assert.equal(removed, 2);
});
