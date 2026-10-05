# PhraseWeave browser extension

This Chrome extension adds the selected-text action **导入 PhraseWeave**. It opens the CLI's local Web UI in a new Chrome tab and automatically generates Markdown and PhraseWeave JSON. Preview the generated learning units, then click **保存并进入练习** to save and start practicing. Nothing is saved to the exercise library before confirmation.

## Setup

1. Install the [npm CLI](../../docs/desktop.md), then run `phraseweave extension install`. This registers the native messaging host for the current Chrome user; no desktop app or administrator access is required.
2. Open `chrome://extensions`, enable **Developer mode**, and choose **Load unpacked** with this directory. Reload the extension after updating it.
3. Run `phraseweave` in a terminal and keep it running while using the extension.
4. Select English text on a web page, then right-click and choose **导入 PhraseWeave**.

The extension uses the running service's actual port and never starts the desktop app or a second service. If the service is stopped, the notification asks you to run `phraseweave`. If the host is missing, run `phraseweave extension install` and reload the extension. Re-run that command if you move the npm installation or change the Node executable.

Selected text is passed through Native Messaging and a private, single-use local file; it is not placed in the URL. A capture expires after 10 minutes. Generated previews remain in the page until saved; refreshing the page requires a fresh import from the extension.
