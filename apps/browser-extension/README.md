# PhraseWeave browser extension

This Chrome extension adds the selected-text action **导入 PhraseWeave**. It opens `http://127.0.0.1:3000/generator` in a new Chrome tab with the selected text in the URL fragment. The Web UI reads and clears the fragment and prefills an editable text area. Choose the translation provider and export format, then click **生成学习单元** to generate and preview the result. Opening the page never starts generation automatically. Click **保存并进入练习** to save and start practicing.

## Setup

1. Install the [npm CLI](../../docs/desktop.md) and download the extension ZIP from [GitHub Releases](https://github.com/ReinerLau/phraseweave/releases), then extract it to a permanent folder.
2. Open `chrome://extensions`, enable **Developer mode**, and choose **Load unpacked** with the extracted directory. Reload the extension after updating it.
3. Run `phraseweave` in a terminal and keep it running while using the extension.
4. Select English text on a web page, then right-click and choose **导入 PhraseWeave**.

No desktop app, Native Messaging host, or CLI extension installation command is required. The extension only opens a tab; the Web UI calls the CLI's local HTTP APIs. If the service is stopped, Chrome cannot connect to the page: start `phraseweave`, then import again. If port 3000 is occupied, the CLI reports an error rather than switching ports.

The fragment can carry up to 30,000 characters, including Unicode and line breaks; it is not sent in the initial page request. The Web UI removes it on receipt. Nothing is saved to the exercise library before confirmation. Generated previews remain in the page until saved; refreshing the page requires a fresh import from the extension.

Translation defaults to local Hy-MT2, downloaded on the first local generation. The page remembers the current browser's provider choice. Index-Translate sends English sentences to Bilibili's public API and requires an internet connection; syntax analysis and learning-unit generation still run locally. Failed generation keeps the input available for editing, retrying, or switching providers.
