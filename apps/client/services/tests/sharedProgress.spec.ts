import { afterEach, describe, expect, it, vi } from "vitest";

import { saveLocalExerciseProgress } from "~/services/localExerciseDb";
import { scopedStorageName } from "~/utils/storageScope";

vi.mock("~/services/generatorClient", () => ({ isLocalPackage: () => true }));

describe("shared exercise progress", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends mode, original cursor and starting occurrence in one request", async () => {
    window.localStorage.setItem(scopedStorageName("phraseweave-shared-data-migrated-v1"), "1");
    const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    vi.stubGlobal("fetch", fetch);
    await saveLocalExerciseProgress("pack", "course", 3, {
      learningMode: "sentence-first",
      sentenceFirstStartIndex: 3,
    });
    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenCalledWith(
      "/api/local-exercises/pack/progress",
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({
          courseId: "course",
          statementIndex: 3,
          learningMode: "sentence-first",
          sentenceFirstStartIndex: 3,
        }),
      }),
    );
    await saveLocalExerciseProgress("pack", "course", 0, {
      learningMode: "progressive",
      sentenceFirstStartIndex: null,
    });
    expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual({
      courseId: "course",
      statementIndex: 0,
      learningMode: "progressive",
      sentenceFirstStartIndex: null,
    });
  });
});
