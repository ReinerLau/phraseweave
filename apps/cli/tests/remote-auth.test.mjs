import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";
import { test } from "node:test";

import {
  loadPassword,
  promptPassword,
  savePassword,
  validateUsername,
  verifyPassword,
} from "../bin/remote-auth.mjs";

test("password storage is salted, private, and validates both account and password", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "phraseweave-auth-"));
  const filename = path.join(directory, "auth.json");
  const password = "test-password-only-123";
  try {
    const first = await savePassword("phraseweave", password, filename);
    assert.equal((await fs.stat(filename)).mode & 0o777, 0o600);
    assert.equal((await fs.readFile(filename, "utf8")).includes(password), false);
    const loaded = await loadPassword(filename, "phraseweave");
    assert.equal(await verifyPassword(loaded, "phraseweave", password), true);
    assert.equal(await verifyPassword(loaded, "someone", password), false);
    assert.equal(await verifyPassword(loaded, "phraseweave", "wrong"), false);
    const second = await savePassword("phraseweave", password, filename);
    assert.notEqual(first.salt, second.salt);
    assert.notEqual(first.hash, second.hash);
    assert.notEqual(first.revision, second.revision);
    await fs.writeFile(filename, "{}");
    await assert.rejects(loadPassword(filename), /缺失或损坏/);
    await assert.rejects(loadPassword(path.join(directory, "missing")), /缺失或损坏/);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("rejects short passwords and unsafe usernames before writing", async () => {
  assert.throws(() => validateUsername("<script>"));
  assert.throws(() => validateUsername(""));
  await assert.rejects(savePassword("phraseweave", "short"), /至少/);
  await assert.rejects(savePassword("phraseweave", "x".repeat(1025)), /1024/);
});

test("password prompt rejects pipes instead of accepting a visible password", async () => {
  if (!process.stdin.isTTY || !process.stdout.isTTY)
    await assert.rejects(promptPassword(), /交互式终端/);
});

test("hidden terminal input accepts eight digits, retries short and mismatched entries, and releases stdin", async () => {
  const input = new PassThrough();
  input.isTTY = true;
  input.isRaw = false;
  input.setRawMode = (raw) => {
    input.isRaw = raw;
  };
  const output = new PassThrough();
  output.isTTY = true;
  const answers = ["1234567", "12345678", "mismatch", "12345678", "12345678"];
  let transcript = "";
  output.on("data", (chunk) => {
    const text = chunk.toString();
    transcript += text;
    if (/^(新密码|再次输入密码).*：$/.test(text)) {
      const answer = answers.shift();
      assert.notEqual(answer, undefined, "unexpected extra prompt");
      queueMicrotask(() => input.write(`${answer}\r`));
    }
  });
  assert.equal(await promptPassword({ input, output }), "12345678");
  assert.match(transcript, /当前密码为 7 个字符/);
  assert.match(transcript, /已输入 8 位/);
  assert.match(transcript, /两次输入的密码不同/);
  assert.doesNotMatch(transcript, /1234567|mismatch/);
  assert.equal(input.isRaw, false);
  assert.equal(input.isPaused(), true);
  input.destroy();
  output.destroy();
});
