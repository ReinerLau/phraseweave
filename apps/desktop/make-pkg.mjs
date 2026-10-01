import { spawnSync } from "node:child_process";
import { constants, cpSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const desktopDir = path.dirname(fileURLToPath(import.meta.url));
const outputDir = path.join(desktopDir, "out", "make");
const stagingRoot = path.join(desktopDir, ".build", "installer-root");
const packageVersion = JSON.parse(readFileSync(path.join(desktopDir, "package.json"), "utf8")).version;
const version = process.env.PHRASEWEAVE_DESKTOP_VERSION || packageVersion;
if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error(`Invalid desktop version: ${version}`);
mkdirSync(outputDir, { recursive: true });
rmSync(stagingRoot, { recursive: true, force: true });
mkdirSync(stagingRoot, { recursive: true });
cpSync(
  path.join(desktopDir, "out", "PhraseWeave-darwin-arm64", "PhraseWeave.app"),
  path.join(stagingRoot, "PhraseWeave.app"),
  { recursive: true, mode: constants.COPYFILE_FICLONE },
);
let result;
try {
  result = spawnSync(
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
} finally {
  rmSync(stagingRoot, { recursive: true, force: true });
}
if (result.error) throw result.error;
if (result.status !== 0) throw new Error(`pkgbuild exited with ${result.status}`);
