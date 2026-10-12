import { describe, expect, it, vi } from "vitest";

import { lookupPronunciation, preloadPronunciations } from "~/services/pronunciation";

describe("offline pronunciation lookup", () => {
  it("preloads once, preserves syllables and stress, and normalizes spellings", async () => {
    const fetch = vi.spyOn(globalThis, "fetch");
    expect(preloadPronunciations()).toBe(preloadPronunciations());
    expect(await lookupPronunciation("Computer")).toEqual(["kəm", "ˈpjuː", "tər"]);
    expect(await lookupPronunciation("CAN’T")).toEqual(["kænt"]);
    expect(await lookupPronunciation("read")).toEqual(["rɛd"]);
    expect(await lookupPronunciation("lead")).toEqual(["lɛd"]);
    expect(await lookupPronunciation("necessary")).toEqual(["ˈnɛ", "sə", "ˌsɛ", "riː"]);
    expect(fetch).not.toHaveBeenCalled();
    fetch.mockRestore();
  });

  it("does not invent pronunciations or expose object prototype properties", async () => {
    for (const word of ["xyzxyzunknown", "shh", "", "two words", "__proto__", "toString", "123"])
      expect(await lookupPronunciation(word)).toBeUndefined();
  });
});
