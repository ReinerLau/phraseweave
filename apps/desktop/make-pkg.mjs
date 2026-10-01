import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const desktopDir = path.dirname(fileURLToPath(import.meta.url));
const outputDir = path.join(desktopDir, "out", "make");
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
    "1.0.0",
    path.join(outputDir, "PhraseWeave-1.0.0-arm64.pkg"),
  ],
  { stdio: "inherit" },
);
if (result.error) throw result.error;
if (result.status !== 0) throw new Error(`pkgbuild exited with ${result.status}`);
