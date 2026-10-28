import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const cliDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceDir = path.resolve(cliDir, "../../tools/lexical_chunks");

test("the packaged Python runtime includes every local module imported by bundled files", () => {
  const buildSource = readFileSync(path.join(cliDir, "build-package.mjs"), "utf8");
  const copyList = /for \(const name of \[([\s\S]*?)\]\) \{/.exec(buildSource)?.[1];
  assert.ok(copyList, "cannot find the Python runtime copy list");
  const packaged = new Set([...copyList.matchAll(/"([\w-]+\.py)"/g)].map((match) => match[1]));
  const localModules = new Set(readdirSync(sourceDir).filter((name) => name.endsWith(".py")));

  for (const file of packaged) {
    const source = readFileSync(path.join(sourceDir, file), "utf8");
    for (const match of source.matchAll(/^\s*(?:from|import)\s+([A-Za-z_][\w]*)/gm)) {
      const imported = `${match[1]}.py`;
      if (!localModules.has(imported)) continue;
      assert.ok(packaged.has(imported), `${file} imports ${imported}, but the npm runtime omits it`);
    }
  }
});
