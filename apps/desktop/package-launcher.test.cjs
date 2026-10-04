const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");

const { installOrUpdate, startPackage, stopPackage } = require("./package-launcher.cjs");

const fakeNpm = `#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const root = process.env.PW_TEST_ROOT;
const directory = path.join(root, "@reinerlau", "phraseweave");
const [command, ...args] = process.argv.slice(2);
if (command === "root") console.log(root);
else if (command === "view") {
  if (process.env.PW_TEST_MODE === "offline") process.exit(1);
  console.log(process.env.PW_TEST_LATEST);
} else if (command === "install") {
  if (process.env.PW_TEST_MODE === "install-fails") process.exit(1);
  const version = args.find(arg => arg.startsWith("@reinerlau/phraseweave@"))?.split("@").at(-1);
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, "package.json"), JSON.stringify({ name: "@reinerlau/phraseweave", version }));
} else process.exit(2);
`;

async function fixture(fn) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "phraseweave-npm-test-"));
  const npm = path.join(directory, "fake-npm");
  const root = path.join(directory, "global");
  await fs.writeFile(npm, fakeNpm, { mode: 0o755 });
  await fs.mkdir(root);
  try {
    await fn({
      root,
      tools: {
        node: process.execPath,
        npm,
        env: { ...process.env, PW_TEST_ROOT: root, PW_TEST_LATEST: "1.0.11" },
      },
    });
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
}

test("installs a missing GitHub Package before launch", async () => {
  await fixture(async ({ tools }) => {
    const installed = await installOrUpdate(() => {}, { tools });
    assert.equal(installed.version, "1.0.11");
    assert.equal(
      installed.directory,
      path.join(tools.env.PW_TEST_ROOT, "@reinerlau", "phraseweave"),
    );
  });
});

test("uses an existing version when the GitHub Package registry is unavailable", async () => {
  await fixture(async ({ root, tools }) => {
    const directory = path.join(root, "@reinerlau", "phraseweave");
    await fs.mkdir(directory, { recursive: true });
    await fs.writeFile(
      path.join(directory, "package.json"),
      JSON.stringify({
        name: "@reinerlau/phraseweave",
        version: "1.0.10",
      }),
    );
    tools.env.PW_TEST_MODE = "offline";
    const installed = await installOrUpdate(() => {}, { tools });
    assert.equal(installed.version, "1.0.10");
  });
});

test("keeps the installed version when an update fails", async () => {
  await fixture(async ({ root, tools }) => {
    const directory = path.join(root, "@reinerlau", "phraseweave");
    await fs.mkdir(directory, { recursive: true });
    await fs.writeFile(
      path.join(directory, "package.json"),
      JSON.stringify({ name: "@reinerlau/phraseweave", version: "1.0.10" }),
    );
    tools.env.PW_TEST_MODE = "install-fails";
    const progress = [];
    const installed = await installOrUpdate((message) => progress.push(message), { tools });
    assert.equal(installed.version, "1.0.10");
    assert.ok(progress.some((message) => message.includes("更新失败")));
  });
});

test("launcher attaches to a running older service version", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "phraseweave-launch-test-"));
  const bin = path.join(directory, "bin");
  await fs.mkdir(bin);
  await fs.writeFile(
    path.join(bin, "phraseweave.mjs"),
    'process.stdout.write(JSON.stringify({ type: "ready", url: "http://127.0.0.1:43127/", version: "1.0.10" }) + "\\n"); process.stdin.resume();',
  );
  let started;
  try {
    started = await startPackage({
      directory,
      node: process.execPath,
      env: process.env,
      version: "1.0.11",
    });
    assert.equal(started.url, "http://127.0.0.1:43127/");
  } finally {
    stopPackage(started?.child);
    await fs.rm(directory, { recursive: true, force: true });
  }
});
