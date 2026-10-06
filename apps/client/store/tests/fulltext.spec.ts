import { flushPromises } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Course, Statement } from "../exercise";
import {
  getLocalExercise,
  saveLocalExercise,
  saveLocalExerciseProgress,
} from "~/services/localExerciseDb";
import { useExerciseStore } from "../exercise";

vi.mock("~/services/localExerciseDb", () => ({
  getLocalExercise: vi.fn(),
  saveLocalExercise: vi.fn().mockResolvedValue(undefined),
  saveLocalExerciseProgress: vi.fn().mockResolvedValue(undefined),
  saveLocalExerciseUnitPassed: vi.fn().mockResolvedValue(undefined),
}));

function sentenceRows(sentence: number): Statement[] {
  const unitIds = ["A", "B", "AB", "C", "ABC"].map((id) => `${sentence}:${id}`);
  const units = [
    { english: "A", contextBefore: "", contextAfter: " B C.", sourceUnitIds: [] },
    { english: "B", contextBefore: "A ", contextAfter: " C.", sourceUnitIds: [] },
    { english: "A B", contextBefore: "", contextAfter: " C.", sourceUnitIds: unitIds.slice(0, 2) },
    { english: "C", contextBefore: "A B ", contextAfter: ".", sourceUnitIds: [] },
    {
      english: "A B C",
      contextBefore: "",
      contextAfter: ".",
      sourceUnitIds: [unitIds[2], unitIds[3]],
    },
  ];
  return [0, 1, 0, 1, 2, 3, 2, 3, 4].map(
    (unit, index) =>
      ({
        ...units[unit],
        id: `${sentence}-row-${index}`,
        order: sentence * 9 + index + 1,
        unitId: unitIds[unit],
        sentenceChinese: `第${sentence + 1}句。`,
      }) as Statement,
  );
}

describe("fulltext practice", () => {
  let course: Course;

  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    course = {
      id: "course",
      coursePackId: "pack",
      title: "文章",
      order: 1,
      completionCount: 0,
      statementIndex: 0,
      learningMode: "sentence-first",
      practiceView: "fulltext",
      statements: [...sentenceRows(0), ...sentenceRows(1), ...sentenceRows(2)],
    };
    vi.mocked(getLocalExercise).mockImplementation(async () => ({
      id: "pack",
      title: "文章",
      description: "",
      isFree: true,
      cover: "",
      courses: [course],
    }));
  });

  async function setup() {
    const store = useExerciseStore();
    await store.setup("pack", "course");
    return store;
  }

  function correct(store: ReturnType<typeof useExerciseStore>) {
    store.passCurrentStatement();
    return store.advanceAfterCorrect();
  }

  it("defaults to single view and keeps the current learning direction", async () => {
    course.practiceView = undefined;
    const store = await setup();
    expect(store.practiceView).toBe("single");
    expect(store.learningMode).toBe("sentence-first");
    expect(store.canUseFulltext).toBe(true);
  });

  it("reveals repeated sentences by occurrence only after each whole sentence passes", async () => {
    const store = await setup();
    expect(store.currentSentenceIndex).toBe(0);
    expect(store.precedingSentences).toEqual([]);
    expect(store.totalQuestionsCount).toBe(3);
    expect(correct(store)).toBe(false);
    expect(store.currentSentenceIndex).toBe(1);
    expect(store.precedingSentences).toEqual([
      expect.objectContaining({ id: "0-row-8", english: "A B C.", chinese: "第1句。" }),
    ]);
    correct(store);
    expect(store.precedingSentences.map((s) => s.id)).toEqual(["0-row-8", "1-row-8"]);
    expect(correct(store)).toBe(true);
    expect(store.fulltextCompleted).toBe(true);
    expect(store.isAllDone()).toBe(true);
  });

  it("keeps all progressive chunks and repeated reviews within their sentence", async () => {
    course.learningMode = "progressive";
    const store = await setup();
    expect(store.totalQuestionsCount).toBe(27);
    for (let index = 0; index < 8; index++) {
      expect(correct(store)).toBe(false);
      expect(store.statementIndex).toBe(index + 1);
      expect(store.precedingSentences).toHaveLength(0);
    }
    correct(store);
    expect(store.statementIndex).toBe(9);
    expect(store.precedingSentences).toHaveLength(1);
  });

  it("blocks every manual navigation API and historic passes cannot unlock the final question", async () => {
    course.statementIndex = 26;
    course.passedUnitIds = ["unit:2:ABC"];
    const store = await setup();
    store.toNextStatement();
    store.toPreviousStatement();
    store.toSpecificStatement(0);
    store.resetStatementIndex();
    expect(store.statementIndex).toBe(26);
    expect(store.advanceAfterCorrect()).toBe(false);
    expect(store.isAllDone()).toBe(false);
    await store.completeCourse();
    expect(saveLocalExercise).not.toHaveBeenCalled();
    // Even a previously passed unit must be answered again in this attempt.
    expect(correct(store)).toBe(true);
    await store.completeCourse();
    expect(saveLocalExercise).toHaveBeenCalledOnce();
    expect(store.advanceAfterCorrect()).toBe(false);
  });

  it("preserves nested recovery and the original anchor when switching only the view", async () => {
    const store = await setup();
    store.failCurrentStatement(); // AB
    store.failCurrentStatement(); // A
    expect(store.currentStatement?.unitId).toBe("0:A");
    store.switchPracticeView("single");
    store.switchPracticeView("fulltext");
    expect(store.isRecovering).toBe(true);
    expect(store.statementIndex).toBe(8);
    for (const id of ["0:B", "0:AB", "0:C", "0:ABC"]) {
      expect(correct(store)).toBe(false);
      expect(store.currentStatement?.unitId).toBe(id);
      expect(store.precedingSentences).toHaveLength(0);
    }
    correct(store);
    expect(store.currentSentenceIndex).toBe(1);
    expect(store.isRecovering).toBe(false);
  });

  it("uses the last occurrence before the anchor on direction switches during recovery", async () => {
    course.statementIndex = 26;
    const store = await setup();
    store.failCurrentStatement();
    store.failCurrentStatement();
    store.switchLearningMode("progressive");
    expect(store.statementIndex).toBe(20);
    expect(store.currentStatement?.id).toBe("2-row-2");
    expect(store.currentSentenceIndex).toBe(2);
    store.switchLearningMode("sentence-first");
    expect(store.currentCourse?.sentenceFirstStartIndex).toBe(20);
    correct(store);
    expect(store.currentStatement?.unitId).toBe("2:ABC");
    expect(store.fulltextCompleted).toBe(false);
    expect(correct(store)).toBe(true);
  });

  it("switches from the current sentence without crediting preceding units", async () => {
    course.practiceView = "single";
    course.learningMode = "progressive";
    course.statementIndex = 12;
    const store = await setup();
    store.switchPracticeView("fulltext");
    expect(store.statementIndex).toBe(12);
    expect(store.precedingSentences).toHaveLength(1);
    expect(course.passedUnitIds).toBeUndefined();
    await flushPromises();
    expect(saveLocalExerciseProgress).toHaveBeenLastCalledWith("pack", "course", 12, {
      learningMode: "progressive",
      sentenceFirstStartIndex: null,
      practiceView: "fulltext",
    });
  });

  it("restores the base question on refresh and restarts with the selected view and direction", async () => {
    course.statementIndex = 11;
    course.sentenceFirstStartIndex = 11;
    let store = await setup();
    correct(store); // starting A -> whole
    store.failCurrentStatement();
    store.failCurrentStatement();
    expect(store.currentStatement?.unitId).toBe("1:A");
    setActivePinia(createPinia());
    store = await setup();
    expect(store.practiceView).toBe("fulltext");
    expect(store.currentStatement?.unitId).toBe("1:ABC");
    expect(store.isRecovering).toBe(false);
    expect(store.precedingSentences).toHaveLength(1);
    store.doAgain();
    expect(store.practiceView).toBe("fulltext");
    expect(store.learningMode).toBe("sentence-first");
    expect(store.currentCourse?.sentenceFirstStartIndex).toBeUndefined();
    expect(store.precedingSentences).toHaveLength(0);
    expect(store.currentStatement?.unitId).toBe("0:ABC");
    expect(store.isAllDone()).toBe(false);
    await flushPromises();
    expect(saveLocalExerciseProgress).toHaveBeenLastCalledWith("pack", "course", 8, {
      learningMode: "sentence-first",
      sentenceFirstStartIndex: null,
      practiceView: "fulltext",
    });
  });

  it("clears acceptance on view switches and on failure", async () => {
    const store = await setup();
    store.passCurrentStatement();
    store.switchPracticeView("single");
    store.switchPracticeView("fulltext");
    expect(store.advanceAfterCorrect()).toBe(false);
    store.passCurrentStatement();
    store.failCurrentStatement();
    expect(store.advanceAfterCorrect()).toBe(false);
    expect(store.currentStatement?.unitId).toBe("0:AB");
  });

  it("recovers via a single source and does not advance an indivisible unit after an error", async () => {
    course.statements = [
      {
        id: "chunk",
        order: 1,
        english: "cat",
        contextBefore: "a ",
        contextAfter: ".",
        sentenceChinese: "一只猫。",
        unitId: "cat",
        sourceUnitIds: [],
      },
      {
        id: "whole",
        order: 2,
        english: "a cat",
        contextBefore: "",
        contextAfter: ".",
        sentenceChinese: "一只猫。",
        unitId: "whole",
        sourceUnitIds: ["cat"],
      },
    ];
    const store = await setup();
    store.failCurrentStatement();
    store.failCurrentStatement();
    expect(store.currentStatement?.unitId).toBe("cat");
    expect(store.advanceAfterCorrect()).toBe(false);
    expect(correct(store)).toBe(false);
    expect(store.currentStatement?.unitId).toBe("whole");
    expect(correct(store)).toBe(true);
  });

  it.each(["context", "translation"])(
    "falls back to single view for missing %s",
    async (missing) => {
      if (missing === "context") course.statements[0].contextAfter = undefined;
      else course.statements[8].sentenceChinese = "";
      const store = await setup();
      expect(store.practiceView).toBe("single");
      expect(store.canUseFulltext).toBe(false);
      expect(store.switchPracticeView("fulltext")).toBe(false);
    },
  );
});
