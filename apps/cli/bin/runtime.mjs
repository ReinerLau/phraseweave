import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const CACHE_ROOT = path.join(os.homedir(), ".cache", "phraseweave");

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { ...options, stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    let errors = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      output += chunk;
    });
    child.stderr.on("data", (chunk) => {
      errors = (errors + chunk).slice(-4000);
      process.stderr.write(chunk);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve(output.trim());
      else reject(new Error(errors.trim() || `${path.basename(command)} exited with ${code}`));
    });
  });
}

export async function snapshotRuntime(source, version) {
  const destination = path.join(CACHE_ROOT, "package", version);
  try {
    await fs.access(path.join(destination, "version.json"));
    return destination;
  } catch {
    // Create an immutable copy before npm replaces a globally installed version.
  }
  const temporary = `${destination}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
  await fs.mkdir(path.dirname(destination), { recursive: true });
  try {
    await fs.cp(source, temporary, { recursive: true, errorOnExist: true, force: false });
    try {
      await fs.rename(temporary, destination);
    } catch (error) {
      if (error.code !== "EEXIST" && error.code !== "ENOTEMPTY") throw error;
      await fs.access(path.join(destination, "version.json"));
    }
  } finally {
    await fs.rm(temporary, { recursive: true, force: true });
  }
  return destination;
}

export class GeneratorRuntime {
  constructor(runtimeRoot) {
    this.root = runtimeRoot;
    this.child = undefined;
    this.startPromise = undefined;
    this.port = undefined;
    this.token = undefined;
    this.error = "";
  }

  async start() {
    if (this.startPromise) return this.startPromise;
    this.startPromise = this.#start();
    try {
      await this.startPromise;
    } catch (error) {
      this.startPromise = undefined;
      throw error;
    }
  }

  async #start() {
    const uv = path.join(this.root, "bin", "uv");
    const project = path.join(this.root, "python");
    const lock = await fs.readFile(path.join(project, "uv.lock"));
    const lockHash = createHash("sha256").update(lock).digest("hex").slice(0, 16);
    const venv = path.join(CACHE_ROOT, "lexical-chunks", `venv-${lockHash}`);
    const env = {
      ...process.env,
      PATH: `${path.dirname(uv)}${path.delimiter}${process.env.PATH || ""}`,
      UV_PROJECT_ENVIRONMENT: venv,
      PHRASEWEAVE_RUNTIME_VENV: venv,
      PHRASEWEAVE_GENERATOR_PORT: "8765",
      PHRASEWEAVE_DESKTOP_TOKEN: randomBytes(32).toString("hex"),
    };
    await run(uv, ["python", "install", "3.13"], { cwd: project, env });
    const python = await run(uv, ["python", "find", "3.13"], { cwd: project, env });
    this.token = env.PHRASEWEAVE_DESKTOP_TOKEN;
    await new Promise((resolve, reject) => {
      const child = spawn(python, [path.join(project, "desktop_runtime.py"), "--service"], {
        cwd: project,
        env,
        detached: true,
        stdio: ["ignore", "pipe", "pipe"],
      });
      this.child = child;
      let ready = false;
      let buffer = "";
      child.stdout.setEncoding("utf8");
      child.stderr.setEncoding("utf8");
      child.stdout.on("data", (chunk) => {
        buffer += chunk;
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          try {
            const record = JSON.parse(line);
            if (record.type === "ready" && Number.isInteger(record.port)) {
              this.port = record.port;
              ready = true;
              resolve();
              continue;
            }
          } catch {
            // Initialization messages are shown by the page through /api/status.
          }
          process.stderr.write(`${line}\n`);
        }
      });
      child.stderr.on("data", (chunk) => {
        this.error = (this.error + chunk).slice(-4000);
        process.stderr.write(chunk);
      });
      child.on("error", (error) => {
        this.error = error.message;
        if (!ready) reject(error);
      });
      child.on("exit", (code) => {
        if (this.child === child) {
          this.child = undefined;
          this.port = undefined;
          this.startPromise = undefined;
        }
        this.error ||= `Generator exited (${code}).`;
        if (!ready) reject(new Error(this.error));
      });
    });
  }

  async request(endpoint, method = "GET", body) {
    if (!this.port) throw new Error(this.error || "Generator is unavailable.");
    return fetch(`http://127.0.0.1:${this.port}${endpoint}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.token}`,
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body,
      signal: AbortSignal.timeout(30_000),
    });
  }

  stop() {
    const child = this.child;
    this.child = undefined;
    this.port = undefined;
    this.startPromise = undefined;
    if (!child?.pid) return;
    try {
      process.kill(-child.pid, "SIGTERM");
    } catch {
      child.kill();
    }
  }

  async restart() {
    this.stop();
    this.error = "";
    await this.start();
  }
}
