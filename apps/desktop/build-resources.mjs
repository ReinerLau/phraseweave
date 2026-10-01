import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const desktopDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(desktopDir, "../..");
const pythonDir = path.join(root, "tools/lexical_chunks");
const buildDir = path.join(desktopDir, ".build");
const development = process.argv.includes("--dev");

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: "inherit", ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} exited with ${result.status}`);
}

rmSync(buildDir, { recursive: true, force: true });
mkdirSync(buildDir, { recursive: true });

const iconset = path.join(buildDir, "PhraseWeave.iconset");
mkdirSync(iconset);
const sourceIcon = path.join(root, "apps/client/public/logo.png");
for (const size of [16, 32, 128, 256, 512]) {
  run("sips", ["-z", String(size), String(size), sourceIcon, "--out", path.join(iconset, `icon_${size}x${size}.png`)]);
  run("sips", ["-z", String(size * 2), String(size * 2), sourceIcon, "--out", path.join(iconset, `icon_${size}x${size}@2x.png`)]);
}
run("iconutil", ["-c", "icns", iconset, "-o", path.join(buildDir, "PhraseWeave.icns")]);
rmSync(iconset, { recursive: true, force: true });

run("pnpm", ["-F", "client", "generate"], {
  cwd: root,
  env: {
    ...process.env,
    NODE_ENV: "production",
    NUXT_APP_BASE_URL: "/",
    DEPLOYMENT_ENVIRONMENT: "desktop",
    BACKEND_ENDPOINT: "",
    LOGTO_ENDPOINT: "",
    LOGTO_APP_ID: "",
    EXERCISE_SYNC_SIGNAL_URL:
      process.env.EXERCISE_SYNC_SIGNAL_URL ||
      "https://phraseweave-course-signal.lk850593913.workers.dev",
    EXERCISE_SYNC_RECEIVE_URL: "https://reinerlau.github.io/phraseweave/receive",
  },
});
cpSync(path.join(root, "apps/client/.output/public"), path.join(buildDir, "client"), {
  recursive: true,
});

if (!development) {
  run(
    "uv",
    [
      "run",
      "--project",
      pythonDir,
      "--locked",
      "--with",
      "pyinstaller==6.22.2",
      "pyinstaller",
      "--noconfirm",
      "desktop_runtime.spec",
    ],
    { cwd: pythonDir },
  );
  cpSync(
    path.join(pythonDir, "dist/phraseweave-runtime"),
    path.join(buildDir, "phraseweave-runtime"),
    { recursive: true },
  );
  run("swiftc", ["-O", "-o", path.join(buildDir, "native-host"), "native-host.swift"], {
    cwd: desktopDir,
  });
}
