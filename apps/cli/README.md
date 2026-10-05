# PhraseWeave local app

This package is published only to GitHub Packages. It supports Apple Silicon macOS.

Authenticate once with a GitHub classic personal access token with `read:packages`:

```sh
npm login --scope=@reinerlau --auth-type=legacy --registry=https://npm.pkg.github.com
npm install -g @reinerlau/phraseweave
phraseweave
```

Open the fixed local URL `http://127.0.0.1:3000/` printed by the command. If port 3000 is occupied, startup fails with an error; the CLI never switches to another port. The first start downloads Python dependencies
and the translation model. The server listens only on `127.0.0.1`; press Ctrl-C to stop it.
Exercises, exercise catalogs, and progress are stored in
`~/Library/Application Support/PhraseWeave/phraseweave.sqlite3` and shared with the desktop app.
On first use, existing local IndexedDB data is imported automatically. Close all old CLI and desktop instances before upgrading if their service uses another port.

## Chrome selected-text import

Download the extension ZIP from [GitHub Releases](https://github.com/ReinerLau/phraseweave/releases), extract it, then load or reload the [browser extension](https://github.com/ReinerLau/phraseweave/tree/main/apps/browser-extension) in Chrome. No desktop app or Native Messaging host is required; `phraseweave extension install` is no longer needed.

Keep `phraseweave` running in a terminal. Select English text in Chrome and choose **导入 PhraseWeave** from its context menu. The extension sends selected text in a URL fragment to the fixed local Web UI. The page clears the fragment on receipt and generates both formats automatically using the single review sequence, replaying direct source units before their combination. Preview the Markdown, then click **保存并进入练习** to save and open the exercise. Nothing is saved before confirmation; refreshing an unsaved preview requires a new import.

This package includes the `uv` executable from Astral Software Inc. Its MIT license is
included in `third-party/uv/LICENSE-MIT`.
