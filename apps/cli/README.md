# PhraseWeave local app

This package is published only to GitHub Packages. It supports Apple Silicon macOS.

Authenticate once with a GitHub classic personal access token with `read:packages`:

```sh
npm login --scope=@reinerlau --auth-type=legacy --registry=https://npm.pkg.github.com
npm install -g @reinerlau/phraseweave
phraseweave
```

Open the fixed local URL `http://127.0.0.1:3000/` printed by the command. If port 3000 is occupied, startup fails with an error; the CLI never switches to another port. The first start downloads Python dependencies.
After dependency setup, the service prepares Kokoro v1.0 audio in the background (about 328 MB). The sound settings show preparation status and offer retry. The fixed `af_heart` American voice runs on the Mac CPU; once prepared, new words and sentences work offline. Phones share the generated MP3s. Clearing audio caches preserves model resources.
New exercises use bilingual text produced by the PhraseWeave Skill. Legacy exercises can still request missing translations through Index-Translate.
The server listens only on `127.0.0.1`; press Ctrl-C to stop it.
Exercises, exercise catalogs, and progress are stored in
`~/Library/Application Support/PhraseWeave/phraseweave.sqlite3` and shared with the desktop app.
On first use, existing local IndexedDB data is imported automatically. Close all old CLI and desktop instances before upgrading if their service uses another port.

## Skill import

Install the repository's `skills/phraseweave` directory into your agent's skills directory. Paste English into Codex and invoke the Skill. It imports the bilingual chain and returns a practice link.

```sh
phraseweave import --file /absolute/path/chain.txt --title "Practice" --request-id UUID --json
# Read alternating English/Chinese lines from stdin
cat chain.txt | phraseweave import --file - --request-id UUID --json
phraseweave stop
```

Use a UUID per import and reuse it for retries of identical content. The command starts the local service if needed and keeps it running after import. `stop` releases background persistence; active desktop and terminal sessions keep the service alive until they close. Import failures preserve the input file.

The browser extension's generation entry has been retired. Existing `/generator` bookmarks redirect to the exercise list.

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
