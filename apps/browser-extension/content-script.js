window.addEventListener("message", (event) => {
  if (
    event.source !== window ||
    event.origin !== window.location.origin ||
    event.data?.type !== "PHRASEWEAVE_CAPTURE_READY" ||
    typeof event.data.requestId !== "string"
  ) {
    return;
  }

  void chrome.runtime
    .sendMessage({
      type: "PHRASEWEAVE_CLAIM_CAPTURE",
      requestId: event.data.requestId,
    })
    .then((result) => {
      if (!result?.ok || typeof result.text !== "string") return;
      window.postMessage(
        {
          type: "PHRASEWEAVE_CAPTURE_RESULT",
          requestId: event.data.requestId,
          text: result.text,
        },
        window.location.origin,
      );
    });
});

window.addEventListener("message", (event) => {
  if (
    event.source !== window ||
    event.origin !== window.location.origin ||
    event.data?.type !== "PHRASEWEAVE_CAPTURE_ACK" ||
    typeof event.data.requestId !== "string"
  ) {
    return;
  }

  void chrome.runtime.sendMessage({
    type: "PHRASEWEAVE_ACK_CAPTURE",
    requestId: event.data.requestId,
  });
});
