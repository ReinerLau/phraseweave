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
