import { spawnSync } from "node:child_process";
import {
  chmodSync,
  cpSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const packageDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(packageDir, "../..");
const runtime = path.join(packageDir, "runtime");
const python = path.join(root, "tools/lexical_chunks");
const metadata = JSON.parse(readFileSync(path.join(packageDir, "package.json"), "utf8"));

if (process.platform !== "darwin" || process.arch !== "arm64") {
  throw new Error("The first PhraseWeave npm package must be built on Apple Silicon macOS.");
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: "inherit", ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} exited with ${result.status}`);
}

rmSync(runtime, { recursive: true, force: true });
mkdirSync(path.join(runtime, "python"), { recursive: true });
mkdirSync(path.join(runtime, "bin"), { recursive: true });

run("pnpm", ["-F", "client", "generate"], {
  cwd: root,
  env: {
    ...process.env,
    NODE_ENV: "production",
    BUILD_VERSION: metadata.version,
    NUXT_APP_BASE_URL: "/",
    DEPLOYMENT_ENVIRONMENT: "local-package",
    BACKEND_ENDPOINT: "",
    LOGTO_ENDPOINT: "",
    LOGTO_APP_ID: "",
    EXERCISE_SYNC_SIGNAL_URL:
      process.env.EXERCISE_SYNC_SIGNAL_URL ||
      "https://phraseweave-course-signal.lk850593913.workers.dev",
    EXERCISE_SYNC_RECEIVE_URL: "https://reinerlau.github.io/phraseweave/receive",
  },
});
cpSync(path.join(root, "apps/client/.output/public"), path.join(runtime, "client"), {
  recursive: true,
});

for (const name of [
  "desktop_runtime.py",
  "local_service.py",
  "model_runtime.py",
  "split_lexical_chunks.py",
  "worker.py",
  "pyproject.toml",
  "uv.lock",
]) {
  cpSync(path.join(python, name), path.join(runtime, "python", name));
}

const uv = process.env.PHRASEWEAVE_UV_BINARY || "uv";
const version = spawnSync(uv, ["--version"], { encoding: "utf8" });
if (version.error) throw version.error;
if (version.status !== 0 || !version.stdout.startsWith("uv 0.11.2 ")) {
  throw new Error("Package build requires uv 0.11.2 for Apple Silicon macOS.");
}
const uvPath = uv.includes(path.sep)
  ? uv
  : spawnSync("which", [uv], { encoding: "utf8" }).stdout.trim();
if (!uvPath) throw new Error("Unable to locate uv executable.");
cpSync(realpathSync(uvPath), path.join(runtime, "bin", "uv"));
chmodSync(path.join(runtime, "bin", "uv"), 0o755);
writeFileSync(
  path.join(runtime, "version.json"),
  JSON.stringify({ version: metadata.version }) + "\n",
);
