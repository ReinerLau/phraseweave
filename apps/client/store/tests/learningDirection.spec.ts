import { flushPromises } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Course, Statement } from "../exercise";
import { getLocalExercise, saveLocalExerciseProgress } from "~/services/localExerciseDb";
import { groupExerciseSentences } from "~/utils/learningDirection";
import { useExerciseStore } from "../exercise";

vi.mock("~/services/localExerciseDb", () => ({
  getLocalExercise: vi.fn(),
  saveLocalExercise: vi.fn().mockResolvedValue(undefined),
  saveLocalExerciseProgress: vi.fn().mockResolvedValue(undefined),
  saveLocalExerciseUnitPassed: vi.fn().mockResolvedValue(undefined),
}));

function sentenceRows(sentenceIndex: number): Statement[] {
  const prefix = `${sentenceIndex}:`;
  const units = [
    { english: "A", contextBefore: "", contextAfter: " B C.", sourceUnitIds: [] },
    { english: "B", contextBefore: "A ", contextAfter: " C.", sourceUnitIds: [] },
    {
      english: "A B",
      contextBefore: "",
      contextAfter: " C.",
      sourceUnitIds: [prefix + "0", prefix + "1"],
    },
    { english: "C", contextBefore: "A B ", contextAfter: ".", sourceUnitIds: [] },
    {
      english: "A B C",
      contextBefore: "",
      contextAfter: ".",
      sourceUnitIds: [prefix + "2", prefix + "3"],
    },
  ];
  return [0, 1, 0, 1, 2, 3, 2, 3, 4].map(
    (unit, index) =>
      ({
        ...units[unit],
        id: `row-${sentenceIndex}-${index}`,
        order: sentenceIndex * 9 + index + 1,
        unitId: prefix + unit,
        sentenceChinese: "甲乙丙。",
      }) as Statement,
  );
}

describe("learning direction", () => {
  let course: Course;

  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    course = {
      id: "course",
      coursePackId: "pack",
      title: "练习",
      order: 1,
      completionCount: 0,
      statementIndex: 0,
      learningMode: "progressive",
      statements: [...sentenceRows(0), ...sentenceRows(1)],
    };
    vi.mocked(getLocalExercise).mockImplementation(async () => ({
      id: "pack",
      title: "练习",
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

  it("defaults to whole sentences and reviews failed sources before retrying", async () => {
    course.learningMode = undefined;
    const store = await setup();
    expect(store.learningMode).toBe("sentence-first");
    expect(store.currentStatement?.unitId).toBe("0:4");
    expect(store.statementIndex).toBe(8);
    expect(store.baseStatements.map((s) => s.id)).toEqual(["row-0-8", "row-1-8"]);
    expect(store.currentCourse?.sentenceFirstStartIndex).toBeUndefined();

    store.failCurrentStatement();
    expect(store.currentStatement?.unitId).toBe("0:2");
    expect(store.statementIndex).toBe(8);
    for (const id of ["0:3", "0:4", "1:4"]) {
      expect(store.advanceAfterCorrect()).toBe(false);
      expect(store.currentStatement?.unitId).toBe(id);
    }
    expect(store.isRecovering).toBe(false);
    expect(store.advanceAfterCorrect()).toBe(true);
  });

  it.each([3, 8, 12, 17])(
    "aligns an unsaved direction at index %i to its whole sentence",
    async (index) => {
      course.learningMode = undefined;
      course.statementIndex = index;
      course.sentenceFirstStartIndex = 3;
      const store = await setup();
      expect(store.learningMode).toBe("sentence-first");
      expect(store.statementIndex).toBe(index <= 8 ? 8 : 17);
      expect(store.totalQuestionsCount).toBe(2);
      expect(store.currentCourse?.sentenceFirstStartIndex).toBeUndefined();
      expect(course.statements).toHaveLength(18);
    },
  );

  it("persists a manual progressive selection and restores it on reload", async () => {
    course.learningMode = undefined;
    let store = await setup();
    expect(store.switchLearningMode("progressive")).toBe(true);
    store.toSpecificStatement(3);
    await flushPromises();
    expect(saveLocalExerciseProgress).toHaveBeenLastCalledWith("pack", "course", 3, {
      learningMode: "progressive",
      sentenceFirstStartIndex: null,
      practiceView: "single",
    });

    setActivePinia(createPinia());
    store = await setup();
    expect(store.learningMode).toBe("progressive");
    expect(store.statementIndex).toBe(3);
    expect(store.currentStatement?.id).toBe("row-0-3");
    expect(store.totalQuestionsCount).toBe(18);
  });

  it("keeps an unsaved direction progressive when sentence groups are incomplete", async () => {
    course.learningMode = undefined;
    course.statements[0].contextAfter = undefined;
    course.statementIndex = 3;
    const store = await setup();
    expect(store.canUseSentenceFirst).toBe(false);
    expect(store.learningMode).toBe("progressive");
    expect(store.statementIndex).toBe(3);
    expect(store.totalQuestionsCount).toBe(18);
  });

  it("keeps saved progressive occurrences and groups identical sentences separately", async () => {
    const store = await setup();
    expect(store.learningMode).toBe("progressive");
    expect(store.baseStatements).toEqual(course.statements);
    expect(store.totalQuestionsCount).toBe(18);
    expect(groupExerciseSentences(course.statements)).toEqual([
      { start: 0, end: 8 },
      { start: 9, end: 17 },
    ]);
  });

  it("starts at the current chunk, then its whole sentence, then the next sentence", async () => {
    const store = await setup();
    store.toSpecificStatement(3);
    expect(store.switchLearningMode("sentence-first")).toBe(true);
    expect(store.currentStatement?.id).toBe("row-0-3");
    expect(store.baseStatements.map((s) => s.id)).toEqual(["row-0-3", "row-0-8", "row-1-8"]);
    expect(store.advanceAfterCorrect()).toBe(false);
    expect(store.currentStatement?.unitId).toBe("0:4");
    expect(store.questionIndex).toBe(1);
    expect(store.statementIndex).toBe(8);
    expect(store.advanceAfterCorrect()).toBe(false);
    expect(store.currentStatement?.unitId).toBe("1:4");
    expect(store.advanceAfterCorrect()).toBe(true);
  });

  it("does not duplicate a whole-sentence starting unit and navigates the active sequence", async () => {
    const store = await setup();
    store.toSpecificStatement(8);
    store.switchLearningMode("sentence-first");
    expect(store.totalQuestionsCount).toBe(2);
    store.toNextStatement();
    expect(store.statementIndex).toBe(17);
    store.toPreviousStatement();
    expect(store.statementIndex).toBe(8);
    store.toSpecificStatement(1);
    expect(store.currentStatement?.unitId).toBe("1:4");
    expect(store.isAllDone()).toBe(true);
  });

  it("recursively reviews all sources without moving base progress", async () => {
    const store = await setup();
    store.toSpecificStatement(8);
    store.switchLearningMode("sentence-first");
    store.failCurrentStatement();
    expect(store.currentStatement?.unitId).toBe("0:2");
    store.failCurrentStatement();
    expect(store.currentStatement?.unitId).toBe("0:0");
    expect(store.statementIndex).toBe(8);
    expect(store.questionIndex).toBe(0);
    store.failCurrentStatement(); // Leaf failures stay at the leaf.
    expect(store.currentStatement?.unitId).toBe("0:0");
    for (const id of ["0:1", "0:2", "0:3", "0:4", "1:4"]) {
      expect(store.advanceAfterCorrect()).toBe(false);
      expect(store.currentStatement?.unitId).toBe(id);
    }
    expect(store.isRecovering).toBe(false);
    expect(store.statementIndex).toBe(17);
  });

  it("switches a nested review to its last occurrence before the original base anchor", async () => {
    const store = await setup();
    store.toSpecificStatement(8);
    store.switchLearningMode("sentence-first");
    store.failCurrentStatement(); // AB
    store.failCurrentStatement(); // A
    store.switchLearningMode("progressive");
    expect(store.statementIndex).toBe(2); // Not A's first occurrence, nor the next sentence's A.
    expect(store.currentStatement?.unitId).toBe("0:0");
    expect(store.isRecovering).toBe(false);
    store.toNextStatement();
    expect(store.statementIndex).toBe(3);
    expect(store.currentStatement?.unitId).toBe("0:1");
  });

  it("uses the original anchor even when a nearer repetition follows the nested target", async () => {
    const store = await setup();
    store.toSpecificStatement(17);
    store.switchLearningMode("sentence-first");
    store.failCurrentStatement();
    store.failCurrentStatement();
    store.advanceAfterCorrect(); // B
    store.switchLearningMode("progressive");
    expect(store.statementIndex).toBe(12);
    expect(store.currentStatement?.id).toBe("row-1-3");
  });

  it("keeps the original occurrence when switching while retrying the base unit", async () => {
    const store = await setup();
    store.toSpecificStatement(8);
    store.switchLearningMode("sentence-first");
    store.failCurrentStatement();
    store.advanceAfterCorrect();
    store.advanceAfterCorrect(); // Retrying whole
    expect(store.isAnsweringBaseUnit).toBe(true);
    store.switchLearningMode("progressive");
    expect(store.statementIndex).toBe(8);
    expect(store.isRecovering).toBe(false);
  });

  it("can switch from a progressive recovery chunk to a fresh complex starting question", async () => {
    const store = await setup();
    store.toSpecificStatement(8);
    store.failCurrentStatement(); // AB
    store.switchLearningMode("sentence-first");
    expect(store.statementIndex).toBe(6);
    expect(store.currentStatement?.unitId).toBe("0:2");
    expect(store.isRecovering).toBe(false);
    store.advanceAfterCorrect();
    expect(store.currentStatement?.unitId).toBe("0:4");
  });

  it("restores mode, cursor and starting chunk on reload, and clears the start on restart", async () => {
    let store = await setup();
    store.toSpecificStatement(3);
    store.switchLearningMode("sentence-first");
    await flushPromises();
    expect(saveLocalExerciseProgress).toHaveBeenLastCalledWith("pack", "course", 3, {
      learningMode: "sentence-first",
      sentenceFirstStartIndex: 3,
      practiceView: "single",
    });
    setActivePinia(createPinia());
    store = await setup();
    expect(store.learningMode).toBe("sentence-first");
    expect(store.currentStatement?.id).toBe("row-0-3");
    expect(store.totalQuestionsCount).toBe(3);
    store.advanceAfterCorrect();
    store.failCurrentStatement();
    setActivePinia(createPinia());
    store = await setup();
    expect(store.currentStatement?.unitId).toBe("0:4");
    expect(store.isRecovering).toBe(false);
    store.doAgain();
    expect(store.currentCourse?.sentenceFirstStartIndex).toBeUndefined();
    expect(store.totalQuestionsCount).toBe(2);
    expect(store.currentStatement?.unitId).toBe("0:4");
    await flushPromises();
    expect(saveLocalExerciseProgress).toHaveBeenLastCalledWith("pack", "course", 8, {
      learningMode: "sentence-first",
      sentenceFirstStartIndex: null,
      practiceView: "single",
    });
  });

  it("keeps legacy or incomplete data progressive and ignores an invalid saved start", async () => {
    course.statements[0].contextAfter = undefined;
    course.learningMode = "sentence-first";
    const store = await setup();
    expect(store.canUseSentenceFirst).toBe(false);
    expect(store.learningMode).toBe("progressive");
    expect(store.switchLearningMode("sentence-first")).toBe(false);
  });

  it("validates saved complex anchors without changing original statements", async () => {
    course.learningMode = "sentence-first";
    course.sentenceFirstStartIndex = 900;
    course.statementIndex = 3;
    const store = await setup();
    expect(store.currentCourse?.sentenceFirstStartIndex).toBeUndefined();
    expect(store.statementIndex).toBe(8);
    expect(course.statements).toHaveLength(18);
  });

  it("recovers via a single source and stays on indivisible whole sentences", async () => {
    course.statements = [
      {
        id: "cat",
        order: 1,
        english: "cat",
        contextBefore: "a ",
        contextAfter: ".",
        unitId: "cat",
        sourceUnitIds: [],
      },
      {
        id: "whole",
        order: 2,
        english: "a cat",
        contextBefore: "",
        contextAfter: ".",
        unitId: "whole",
        sourceUnitIds: ["cat"],
      },
    ];
    const store = await setup();
    store.toSpecificStatement(1);
    store.switchLearningMode("sentence-first");
    store.failCurrentStatement();
    expect(store.currentStatement?.unitId).toBe("cat");
    expect(store.advanceAfterCorrect()).toBe(false);
    expect(store.currentStatement?.unitId).toBe("whole");
    expect(store.advanceAfterCorrect()).toBe(true);
    store.doAgain();
    course.statements[1].sourceUnitIds = [];
    await store.setup("pack", "course");
    store.failCurrentStatement();
    expect(store.currentStatement?.unitId).toBe("whole");
    expect(store.isRecovering).toBe(false);
  });
});
