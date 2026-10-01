import { spawnSync } from "node:child_process";
import { constants, cpSync, existsSync, mkdirSync, readFileSync, readdirSync, readlinkSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const desktopDir = path.dirname(fileURLToPath(import.meta.url));
const outputDir = path.join(desktopDir, "out", "make");
const stagingRoot = path.join(desktopDir, ".build", "installer-root");
const stagedApp = path.join(stagingRoot, "PhraseWeave.app");
const packageVersion = JSON.parse(readFileSync(path.join(desktopDir, "package.json"), "utf8")).version;
const version = process.env.PHRASEWEAVE_DESKTOP_VERSION || packageVersion;
if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error(`Invalid desktop version: ${version}`);
mkdirSync(outputDir, { recursive: true });
rmSync(stagingRoot, { recursive: true, force: true });
mkdirSync(stagingRoot, { recursive: true });

function assertBundleSymlinks(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const location = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      assertBundleSymlinks(location);
    } else if (entry.isSymbolicLink()) {
      const target = readlinkSync(location);
      if (path.isAbsolute(target) || !existsSync(location)) {
        throw new Error(`Invalid app bundle symlink: ${location} -> ${target}`);
      }
    }
  }
}

try {
  cpSync(
    path.join(desktopDir, "out", "PhraseWeave-darwin-arm64", "PhraseWeave.app"),
    stagedApp,
    { recursive: true, mode: constants.COPYFILE_FICLONE, verbatimSymlinks: true },
  );
  assertBundleSymlinks(stagedApp);
  const result = spawnSync(
    "pkgbuild",
    [
      "--root",
      stagingRoot,
      "--component-plist",
      path.join(desktopDir, "installer-components.plist"),
      "--install-location",
      "/Applications",
      "--scripts",
      path.join(desktopDir, "scripts"),
      "--identifier",
      "com.reinerlau.phraseweave",
      "--version",
      version,
      path.join(outputDir, `PhraseWeave-${version}-arm64.pkg`),
    ],
    { stdio: "inherit" },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`pkgbuild exited with ${result.status}`);
} finally {
  rmSync(stagingRoot, { recursive: true, force: true });
}
