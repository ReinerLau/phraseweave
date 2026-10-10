import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { emitKeypressEvents } from "node:readline";
import { promisify } from "node:util";

import { DATA_DIR } from "./shared.mjs";

export const AUTH_FILE = path.join(DATA_DIR, "remote-auth.json");
const derive = promisify(scrypt);
const SCRYPT_OPTIONS = { N: 131072, r: 8, p: 1, maxmem: 256 * 1024 * 1024 };
const MIN_PASSWORD_LENGTH = 8;

export function validateUsername(username) {
  if (typeof username !== "string" || !/^[A-Za-z0-9_.-]{1,64}$/.test(username)) {
    throw new Error("用户名须为 1–64 位字母、数字、下划线、点或短横线。");
  }
  return username;
}

function validatePassword(password) {
  if (
    typeof password !== "string" ||
    [...password].length < MIN_PASSWORD_LENGTH ||
    Buffer.byteLength(password) > 1024
  ) {
    const length = typeof password === "string" ? [...password].length : 0;
    throw new Error(
      `当前密码为 ${length} 个字符，至少需要 ${MIN_PASSWORD_LENGTH} 个字符，且不能超过 1024 字节。`,
    );
  }
}

export async function savePassword(username, password, filename = AUTH_FILE) {
  validateUsername(username);
  validatePassword(password);
  const salt = randomBytes(32).toString("hex");
  const hash = await derive(password, Buffer.from(salt, "hex"), 32, SCRYPT_OPTIONS);
  const record = {
    version: 1,
    username,
    revision: randomBytes(16).toString("hex"),
    salt,
    hash: hash.toString("hex"),
  };
  await fs.mkdir(path.dirname(filename), { recursive: true, mode: 0o700 });
  const temporary = `${filename}.${randomBytes(8).toString("hex")}.tmp`;
  try {
    await fs.writeFile(temporary, `${JSON.stringify(record)}\n`, { mode: 0o600, flag: "wx" });
    await fs.rename(temporary, filename);
  } finally {
    await fs.rm(temporary, { force: true });
  }
  return record;
}

export async function loadPassword(filename = AUTH_FILE, username) {
  try {
    const record = JSON.parse(await fs.readFile(filename, "utf8"));
    validateUsername(record.username);
    if (
      record.version !== 1 ||
      !/^[0-9a-f]{32}$/.test(record.revision) ||
      !/^[0-9a-f]{64}$/.test(record.salt) ||
      !/^[0-9a-f]{64}$/.test(record.hash) ||
      (username !== undefined && username !== record.username)
    )
      throw new Error("Invalid credentials");
    return record;
  } catch {
    throw new Error("远程密码配置缺失或损坏，请在本机执行 remote password 重新设置。");
  }
}

export async function verifyPassword(record, username, password) {
  if (typeof password !== "string" || Buffer.byteLength(password) > 1024) return false;
  const hash = await derive(password, Buffer.from(record.salt, "hex"), 32, SCRYPT_OPTIONS);
  const digest = (value) => createHash("sha256").update(value).digest();
  const matchesUser = timingSafeEqual(digest(String(username)), digest(record.username));
  return timingSafeEqual(hash, Buffer.from(record.hash, "hex")) && matchesUser;
}

function hiddenInput(label, input, output) {
  if (!input.isTTY || !output.isTTY) {
    throw new Error("请在本机交互式终端设置密码；不接受命令参数或管道中的密码。");
  }
  output.write(label);
  return new Promise((resolve, reject) => {
    let value = "";
    const previousRaw = input.isRaw;
    emitKeypressEvents(input);
    input.setRawMode(true);
    input.resume();
    const finish = (error) => {
      input.off("keypress", onKey);
      input.setRawMode(previousRaw);
      input.pause();
      output.write("\n");
      if (error) reject(error);
      else resolve(value);
    };
    const onKey = (text, key = {}) => {
      if (key.ctrl && (key.name === "c" || key.name === "d"))
        return finish(new Error("已取消密码设置。"));
      if (key.name === "return" || key.name === "enter") return finish();
      if (key.name === "backspace" || key.name === "delete") {
        value = [...value].slice(0, -1).join("");
      } else if (key.ctrl && key.name === "u") {
        value = "";
      } else if (text && !key.ctrl && !key.meta && !/[\x00-\x1f\x7f]/.test(text)) {
        if (Buffer.byteLength(value + text) <= 1024) {
          value += text;
        }
      }
      output.write(
        `\r${label}${"*".repeat([...value].length)}（已输入 ${[...value].length} 位）\x1b[K`,
      );
    };
    input.on("keypress", onKey);
  });
}

export async function promptPassword({ input = process.stdin, output = process.stdout } = {}) {
  output.write("密码内容不会显示，星号只表示已输入的字符数；输入后按回车。\n");
  while (true) {
    const password = await hiddenInput(`新密码（至少 ${MIN_PASSWORD_LENGTH} 位）：`, input, output);
    try {
      validatePassword(password);
    } catch (error) {
      output.write(`${error.message} 请重新输入。\n`);
      continue;
    }
    const confirmation = await hiddenInput("再次输入密码：", input, output);
    if (password === confirmation) return password;
    output.write("两次输入的密码不同，未修改配置。请重新输入。\n");
  }
}
