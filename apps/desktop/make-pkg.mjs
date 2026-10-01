import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const desktopDir = path.dirname(fileURLToPath(import.meta.url));
const outputDir = path.join(desktopDir, "out", "make");
const packageVersion = JSON.parse(readFileSync(path.join(desktopDir, "package.json"), "utf8")).version;
const version = process.env.PHRASEWEAVE_DESKTOP_VERSION || packageVersion;
if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error(`Invalid desktop version: ${version}`);
mkdirSync(outputDir, { recursive: true });
const result = spawnSync(
  "pkgbuild",
  [
    "--component",
    path.join(desktopDir, "out", "PhraseWeave-darwin-arm64", "PhraseWeave.app"),
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
