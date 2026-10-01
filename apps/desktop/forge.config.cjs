const path = require("node:path");

module.exports = {
  packagerConfig: {
    name: "PhraseWeave",
    executableName: "PhraseWeave",
    appBundleId: "com.reinerlau.phraseweave",
    icon: path.join(__dirname, ".build", "PhraseWeave.icns"),
    asar: true,
    protocols: [{ name: "PhraseWeave capture", schemes: ["phraseweave"] }],
    extraResource: [
      path.join(__dirname, ".build", "client"),
      path.join(__dirname, ".build", "phraseweave-runtime"),
      path.join(__dirname, ".build", "native-host"),
    ],
    ignore: [/^\/\.build($|\/)/, /^\/scripts($|\/)/, /^\/native-host\.swift$/],
  },
};
