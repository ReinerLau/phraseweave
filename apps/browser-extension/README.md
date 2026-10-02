# PhraseWeave browser extension

This Chrome extension adds two selected-text actions: **导入 PhraseWeave 网页版** and **导入 PhraseWeave 桌面版**. Both use the same generator page and import the resulting exercise into the chosen app's own exercise list.

## Install in Chrome

1. Open `chrome://extensions`, turn on **Developer mode**, and choose **Load unpacked** with this `apps/browser-extension` directory. Reload the extension if it was installed before the two-destination update.
2. For the website action, open PhraseWeave Desktop or start the local generator with `phraseweave`.
3. For the desktop action, follow the [macOS app setup](../../docs/desktop.md). The launcher installer registers the native messaging host, which can launch the app when needed; the local page and generator come from its GitHub Packages npm package.

The website action keeps selected text in extension session storage until the generator page claims it. The desktop action sends text through Chrome Native Messaging. Neither action places text in a URL. If desktop delivery fails, the extension shows a notification and does not silently import into the website.
