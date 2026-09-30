# PhraseWeave browser extension

This Chrome Manifest V3 extension adds **用 PhraseWeave 练习选中文本** to the right-click menu for selected text. It opens PhraseWeave's `/generator` page, which creates and imports an exercise before opening the first practice card.

## Install in Chrome

1. Start the local generator service from the repository root:

   ```bash
   python3 tools/lexical_chunks/local_service.py
   ```

2. Open `chrome://extensions` and turn on **Developer mode**.
3. Choose **Load unpacked** and select this `apps/browser-extension` directory.
4. In an article, select English text, right-click, and choose **用 PhraseWeave 练习选中文本**.

Generation runs on the computer through the local service. The selected text stays in extension session storage only until the PhraseWeave page receives it; it is not put in the URL. The extension injects its content script only on the PhraseWeave generator page. It also supports local development at `http://localhost:3000` and `http://127.0.0.1:3000`.
