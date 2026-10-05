import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { DATA_DIR } from "./shared.mjs";

export const NATIVE_HOST = "com.phraseweave.webcapture";
const EXTENSION_ID = "mdjoodikmclnnbcdaiiiibihemokenjg";
const shellQuote = (value) => `'${value.replaceAll("'", "'\\''")}'`;

export async function installExtension({
  home = os.homedir(),
  dataDir = DATA_DIR,
  node = process.execPath,
  entry = fileURLToPath(new URL("./native-host.mjs", import.meta.url)),
} = {}) {
  const hostDir = path.join(
    home,
    "Library",
    "Application Support",
    "Google",
    "Chrome",
    "NativeMessagingHosts",
  );
  const wrapper = path.join(dataDir, "webcapture-host");
  await fs.mkdir(dataDir, { recursive: true, mode: 0o700 });
  await fs.mkdir(hostDir, { recursive: true });
  await fs.writeFile(
    wrapper,
    `#!/bin/sh\nexec ${shellQuote(node)} ${shellQuote(entry)} --data-dir ${shellQuote(dataDir)}\n`,
    { mode: 0o700 },
  );
  await fs.chmod(wrapper, 0o700);
  const manifest = path.join(hostDir, `${NATIVE_HOST}.json`);
  await fs.writeFile(
    manifest,
    JSON.stringify(
      {
        name: NATIVE_HOST,
        description: "Open selected text in the PhraseWeave local Web UI",
        path: wrapper,
        type: "stdio",
        allowed_origins: [`chrome-extension://${EXTENSION_ID}/`],
      },
      null,
      2,
    ) + "\n",
    { mode: 0o600 },
  );
  return { manifest, wrapper };
}
