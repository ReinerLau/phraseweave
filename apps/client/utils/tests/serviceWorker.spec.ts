import { describe, expect, it } from "vitest";

import { getServiceWorkerRegistration } from "../serviceWorker";

describe("service worker registration", () => {
  it.each([
    ["/", "/sw.js", "/"],
    ["/phraseweave/", "/phraseweave/sw.js", "/phraseweave/"],
    ["/phraseweave", "/phraseweave/sw.js", "/phraseweave/"],
  ])("normalizes the app base URL %s", (baseURL, scriptUrl, scope) => {
    expect(getServiceWorkerRegistration(baseURL)).toEqual({ scriptUrl, scope });
  });
});
