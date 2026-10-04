# PhraseWeave browser extension

This Chrome extension adds a selected-text action, **导入 PhraseWeave**. It sends the selected text through Chrome Native Messaging to the macOS launcher, which opens the shared generator and saves the resulting exercise.

Install the [macOS launcher](../../docs/desktop.md) first; its installer registers the native messaging host. Then open `chrome://extensions`, enable **Developer mode**, and choose **Load unpacked** with this directory. Reload the extension after updating it.

Selected text is not placed in a URL. If delivery fails, the extension shows a notification.
