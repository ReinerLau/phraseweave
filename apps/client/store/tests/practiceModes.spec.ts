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

function sentence(index: number): Statement[] {
  return [
    { english: "Cats", contextBefore: "", contextAfter: " sleep.", sourceUnitIds: [] },
    { english: "sleep", contextBefore: "Cats ", contextAfter: ".", sourceUnitIds: [] },
    {
      english: "Cats sleep",
      contextBefore: "",
      contextAfter: ".",
      sourceUnitIds: [`${index}:0`, `${index}:1`],
    },
  ].map((unit, position) => ({
    ...unit,
    id: `${index}:${position}`,
    unitId: `${index}:${position}`,
    order: index * 3 + position + 1,
    sentenceChinese: "猫在睡觉。",
  })) as Statement[];
}

describe("temporary practice mode restriction", () => {
  let course: Course;

  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    course = {
      id: "course",
      coursePackId: "pack",
      title: "文章",
      order: 1,
      completionCount: 0,
      statementIndex: 0,
      statements: [...sentence(0), ...sentence(1)],
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

  it("starts at the whole sentence in fulltext and persists the defaults", async () => {
    const store = await setup();
    expect(store.learningMode).toBe("sentence-first");
    expect(store.practiceView).toBe("fulltext");
    expect(store.statementIndex).toBe(2);
    expect(store.totalQuestionsCount).toBe(2);
    expect(store.switchLearningMode("progressive")).toBe(false);
    expect(store.switchPracticeView("single")).toBe(false);
    await flushPromises();
    expect(saveLocalExerciseProgress).toHaveBeenLastCalledWith("pack", "course", 2, {
      learningMode: "sentence-first",
      practiceView: "fulltext",
      sentenceFirstStartIndex: null,
      resumeStatementIndex: 2,
    });
  });

  it("normalizes saved alternate modes without an extra chunk starting question", async () => {
    course.learningMode = "progressive";
    course.practiceView = "single";
    course.sentenceFirstStartIndex = 1;
    course.statementIndex = 1;
    const store = await setup();
    expect(store.learningMode).toBe("sentence-first");
    expect(store.practiceView).toBe("fulltext");
    expect(store.currentCourse?.sentenceFirstStartIndex).toBeUndefined();
    expect(store.baseStatements.map((unit) => unit.id)).toEqual(["0:2", "1:2"]);
  });

  it("starts new comma practice with isolated parts and reviews whole sentences after completion", async () => {
    course.practiceSequence = "comma-segments-v1";
    course.statements = [
      {
        id: "part-a",
        order: 1,
        english: "Read this",
        contextBefore: "",
        contextAfter: ", then write.",
        sentenceChinese: "读这个",
        unitId: "0:0",
        sourceUnitIds: [],
      },
      {
        id: "part-b",
        order: 2,
        english: "then write.",
        contextBefore: "Read this, ",
        contextAfter: "",
        sentenceChinese: "然后写。",
        unitId: "0:1",
        sourceUnitIds: [],
      },
      {
        id: "whole-a",
        order: 3,
        english: "Read this, then write.",
        contextBefore: "",
        contextAfter: "",
        sentenceChinese: "读这个，然后写。",
        unitId: "0:2",
        sourceUnitIds: [],
      },
      {
        id: "whole-b",
        order: 4,
        english: "Birds sing.",
        contextBefore: "",
        contextAfter: "",
        sentenceChinese: "鸟在歌唱。",
        unitId: "1:0",
        sourceUnitIds: [],
      },
    ];
    let store = await setup();
    expect(store.learningMode).toBe("progressive");
    expect(store.baseStatements.map((unit) => unit.id)).toEqual([
      "part-a",
      "part-b",
      "whole-a",
      "whole-b",
    ]);
    expect(store.isCommaSegmentQuestion).toBe(true);
    expect(store.currentPracticeText).toBe("Read this");
    store.doAgain();
    expect(store.learningMode).toBe("progressive");
    expect(store.currentStatement?.id).toBe("part-a");
    store.passCurrentStatement();
    expect(store.advanceAfterCorrect()).toBe(false);
    expect(store.currentPracticeText).toBe("then write.");
    await flushPromises();

    setActivePinia(createPinia());
    store = await setup();
    expect(store.statementIndex).toBe(1);
    expect(store.learningMode).toBe("progressive");
    for (const next of ["whole-a", "whole-b"]) {
      store.passCurrentStatement();
      expect(store.advanceAfterCorrect()).toBe(false);
      expect(store.currentStatement?.id).toBe(next);
    }
    expect(store.isCommaSegmentQuestion).toBe(false);
    store.passCurrentStatement();
    expect(store.advanceAfterCorrect()).toBe(true);
    await store.completeCourse();
    store.doAgain();
    expect(store.learningMode).toBe("sentence-first");
    expect(store.baseStatements.map((unit) => unit.id)).toEqual(["whole-a", "whole-b"]);
    expect(store.currentStatement?.id).toBe("whole-a");
    expect(store.currentPracticeText).toBe("Read this, then write.");

    course.resumeStatementIndex = null;
    course.statementIndex = 3;
    setActivePinia(createPinia());
    store = await setup();
    expect(store.learningMode).toBe("sentence-first");
    expect(store.currentStatement?.id).toBe("whole-a");
    expect(store.resumeQuestionIndex).toBe(0);

    course.completionCount = 0;
    course.resumeStatementIndex = 2;
    setActivePinia(createPinia());
    store = await setup();
    expect(store.learningMode).toBe("sentence-first");
    expect(store.currentStatement?.id).toBe("whole-a");
  });

  it("keeps recovery within the sentence, resumes after reload, settles and restarts", async () => {
    let store = await setup();
    expect(store.advanceAfterCorrect()).toBe(false);
    expect(store.statementIndex).toBe(2);
    store.failCurrentStatement();
    for (const id of ["0:0", "0:1"]) {
      expect(store.currentStatement?.id).toBe(id);
      store.passCurrentStatement();
      expect(store.advanceAfterCorrect()).toBe(false);
      expect(store.currentSentenceIndex).toBe(0);
    }
    expect(store.currentStatement?.id).toBe("0:2");
    store.passCurrentStatement();
    expect(store.advanceAfterCorrect()).toBe(false);
    expect(store.currentSentenceIndex).toBe(1);
    await flushPromises();

    setActivePinia(createPinia());
    store = await setup();
    expect(store.statementIndex).toBe(5);
    expect(store.practiceView).toBe("fulltext");
    expect(store.learningMode).toBe("sentence-first");
    await store.completeCourse();
    expect(saveLocalExercise).not.toHaveBeenCalled();
    store.passCurrentStatement();
    expect(store.advanceAfterCorrect()).toBe(true);
    expect(store.fulltextCompleted).toBe(true);
    await store.completeCourse();
    expect(saveLocalExercise).toHaveBeenCalledOnce();
    expect(course.completionCount).toBe(1);
    store.doAgain();
    expect(store.statementIndex).toBe(2);
    expect(store.fulltextCompleted).toBe(false);
    expect(store.practiceView).toBe("fulltext");
    expect(store.learningMode).toBe("sentence-first");
  });

  it.each(["groups", "missing Chinese", "blank Chinese", "empty"])(
    "rejects incompatible data: %s",
    async (missing) => {
      if (missing === "groups") course.statements[0].contextAfter = undefined;
      if (missing === "missing Chinese") course.statements[5].sentenceChinese = undefined;
      if (missing === "blank Chinese") course.statements[5].sentenceChinese = "  ";
      if (missing === "empty") course.statements = [];
      const store = useExerciseStore();
      await expect(store.setup("pack", "course")).rejects.toThrow("请重新生成");
      expect(store.currentCourse).toBeUndefined();
      expect(saveLocalExerciseProgress).not.toHaveBeenCalled();
    },
  );
});
