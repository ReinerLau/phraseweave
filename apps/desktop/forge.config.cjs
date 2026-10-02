const path = require("node:path");
const packageVersion = require("./package.json").version;
const appVersion = process.env.PHRASEWEAVE_DESKTOP_VERSION || packageVersion;

if (!/^\d+\.\d+\.\d+$/.test(appVersion)) {
  throw new Error(`Invalid desktop version: ${appVersion}`);
}

module.exports = {
  packagerConfig: {
    name: "PhraseWeave",
    executableName: "PhraseWeave",
    appBundleId: "com.reinerlau.phraseweave",
    appVersion,
    icon: path.join(__dirname, ".build", "PhraseWeave.icns"),
    asar: true,
    protocols: [{ name: "PhraseWeave capture", schemes: ["phraseweave"] }],
    extraResource: [path.join(__dirname, ".build", "native-host")],
    ignore: [/^\/\.build($|\/)/, /^\/scripts($|\/)/, /^\/native-host\.swift$/],
  },
};
