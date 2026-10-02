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

This package includes the `uv` executable from Astral Software Inc. Its MIT license is
included in `third-party/uv/LICENSE-MIT`.
