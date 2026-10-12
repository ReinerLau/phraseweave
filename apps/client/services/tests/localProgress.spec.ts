import { indexedDB } from "fake-indexeddb";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getLocalExercise,
  normalizeExerciseImport,
  saveLocalExercise,
  saveLocalExerciseProgress,
  saveLocalExerciseUnitPassed,
} from "~/services/localExerciseDb";

vi.mock("~/services/generatorClient", () => ({ isLocalPackage: () => false }));

describe("IndexedDB return position", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("saves the cursor separately from the return position and protects updates from stale writes", async () => {
    vi.stubGlobal("indexedDB", indexedDB);
    const [pack] = normalizeExerciseImport({
      schema_version: 4,
      statements: [0, 1, 2].map((index) => ({
        english: `Sentence ${index}`,
        context_before: "",
        context_after: ".",
        sentence_chinese: `第${index}句。`,
        unit_id: `whole-${index}`,
        source_unit_ids: [],
      })),
    });
    await saveLocalExercise(pack);
    const courseId = pack.courses[0].id;
    await saveLocalExerciseProgress(pack.id, courseId, 0, {
      learningMode: "sentence-first",
      sentenceFirstStartIndex: null,
      practiceView: "fulltext",
      resumeStatementIndex: 2,
    });
    await saveLocalExerciseUnitPassed(pack.id, courseId, "unit:whole-0");
    pack.courses[0].resumeStatementIndex = 1;
    pack.courses[0].statementIndex = 1;
    pack.courses[0].completionCount = 1;
    await saveLocalExercise(pack);
    expect((await getLocalExercise(pack.id))?.courses[0]).toMatchObject({
      statementIndex: 0,
      resumeStatementIndex: 2,
      practiceView: "fulltext",
      completionCount: 1,
      passedUnitIds: ["unit:whole-0"],
    });
    await saveLocalExerciseProgress(pack.id, courseId, 1);
    expect((await getLocalExercise(pack.id))?.courses[0].resumeStatementIndex).toBe(2);
    await saveLocalExerciseProgress(pack.id, courseId, 2, {
      learningMode: "sentence-first",
      sentenceFirstStartIndex: null,
      resumeStatementIndex: null,
    });
    await saveLocalExercise(pack);
    expect((await getLocalExercise(pack.id))?.courses[0].resumeStatementIndex).toBeNull();
    await saveLocalExerciseProgress(pack.id, courseId, 0, {
      learningMode: "sentence-first",
      sentenceFirstStartIndex: null,
      resumeStatementIndex: 0,
    });
    expect((await getLocalExercise(pack.id))?.courses[0].resumeStatementIndex).toBe(0);
  });
});
