# PhraseWeave local app

This package is published only to GitHub Packages. It supports Apple Silicon macOS.

Authenticate once with a GitHub classic personal access token with `read:packages`:

```sh
npm login --scope=@reinerlau --auth-type=legacy --registry=https://npm.pkg.github.com
npm install -g @reinerlau/phraseweave
phraseweave
```

Open the local URL printed by the command. The first start downloads Python dependencies
and the translation model. The server listens only on `127.0.0.1`; press Ctrl-C to stop it.
Exercises, exercise catalogs, and progress are stored in
`~/Library/Application Support/PhraseWeave/phraseweave.sqlite3` and shared with the desktop app.
On first use, existing local IndexedDB data is imported automatically.

## Chrome selected-text import

Run `phraseweave extension install` to register the Chrome native messaging host for your user, then load or reload the [browser extension](https://github.com/ReinerLau/phraseweave/tree/main/apps/browser-extension). No desktop app is required. Re-run the install command after moving the npm package or changing your Node executable.

Keep `phraseweave` running in a terminal. Select English text in Chrome and choose **导入 PhraseWeave** from its context menu. The extension opens the running local Web UI and generates both formats automatically using the single review sequence, replaying direct source units before their combination. Preview the Markdown, then click **保存并进入练习** to save and open the exercise. Nothing is saved before confirmation; refreshing an unsaved preview requires a new import.

This package includes the `uv` executable from Astral Software Inc. Its MIT license is
included in `third-party/uv/LICENSE-MIT`.
