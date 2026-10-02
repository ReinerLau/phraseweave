import { spawnSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const desktopDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(desktopDir, "../..");
const buildDir = path.join(desktopDir, ".build");

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
  run("sips", [
    "-z",
    String(size),
    String(size),
    sourceIcon,
    "--out",
    path.join(iconset, `icon_${size}x${size}.png`),
  ]);
  run("sips", [
    "-z",
    String(size * 2),
    String(size * 2),
    sourceIcon,
    "--out",
    path.join(iconset, `icon_${size}x${size}@2x.png`),
  ]);
}
run("iconutil", ["-c", "icns", iconset, "-o", path.join(buildDir, "PhraseWeave.icns")]);
rmSync(iconset, { recursive: true, force: true });

run("swiftc", ["-O", "-o", path.join(buildDir, "native-host"), "native-host.swift"], {
  cwd: desktopDir,
});
