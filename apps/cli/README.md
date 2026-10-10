# PhraseWeave local app

This package is published only to GitHub Packages. It supports Apple Silicon macOS.

Authenticate once with a GitHub classic personal access token with `read:packages`:

```sh
npm login --scope=@reinerlau --auth-type=legacy --registry=https://npm.pkg.github.com
npm install -g @reinerlau/phraseweave
phraseweave
```

Open the fixed local URL `http://127.0.0.1:3000/` printed by the command. If port 3000 is occupied, startup fails with an error; the CLI never switches to another port. The first start downloads Python dependencies.
Translation defaults to local Hy-MT2, downloaded on the first local generation. You can select Index-Translate in the generator instead; it sends English sentences to Bilibili's public API without downloading Hy-MT2. The page remembers the current browser's provider choice. Public requests time out after 30 seconds per sentence; failures are shown without automatic fallback.
The server listens only on `127.0.0.1`; press Ctrl-C to stop it.
Exercises, exercise catalogs, and progress are stored in
`~/Library/Application Support/PhraseWeave/phraseweave.sqlite3` and shared with the desktop app.
On first use, existing local IndexedDB data is imported automatically. Close all old CLI and desktop instances before upgrading if their service uses another port.

## Chrome selected-text import

Download the extension ZIP from [GitHub Releases](https://github.com/ReinerLau/phraseweave/releases), extract it, then load or reload the [browser extension](https://github.com/ReinerLau/phraseweave/tree/main/apps/browser-extension) in Chrome. No desktop app or Native Messaging host is required; `phraseweave extension install` is no longer needed.

Keep `phraseweave` running in a terminal. Select English text in Chrome and choose **导入 PhraseWeave** from its context menu. The extension sends selected text in a URL fragment to the fixed local Web UI. The page clears the fragment on receipt and prefills the editable generator form without generating. Choose the translation provider and export format, then click **生成学习单元**. Both formats use the single review sequence, replaying direct source units before their combination. Preview the result, then click **保存并进入练习** to save and open the exercise. Nothing is saved before confirmation; refreshing an unsaved preview requires a new import.

This package includes the `uv` executable from Astral Software Inc. Its MIT license is
included in `third-party/uv/LICENSE-MIT`.

## Remote access with a password

After connecting a domain to Cloudflare and creating a locally managed Tunnel, configure
the existing tunnel from an interactive terminal:

```sh
phraseweave remote configure --auth password --username phraseweave \
  --origin https://your-domain.example \
  --tunnel-id TUNNEL_UUID \
  --credentials-file /absolute/path/TUNNEL_UUID.json
```

Enter a password of at least 8 characters twice at the masked prompts, then restart the app.
The tunnel connects to a password gateway protecting all pages, audio, and APIs. Local access
remains available without login. This mode does not require activating Cloudflare Access.

The single account shares the existing exercises and progress. Sessions use a Secure,
HttpOnly, SameSite=Strict browser session cookie and expire after at most 24 hours or a service
restart. Mobile browser session restoration may retain the cookie; use **退出登录** to end a
session explicitly. Run `phraseweave remote password` locally to reset the password and
immediately invalidate all existing sessions. Only a salted scrypt hash is stored, in a private
`remote-auth.json` file alongside the app data; passwords cannot be supplied as arguments or pipes.

`phraseweave remote status` shows the address and authentication mode. `phraseweave remote disable`
disables remote access after a restart. Existing `--team-name` and `--aud-tag` configurations
continue to use Cloudflare Access and its JWT validation.
