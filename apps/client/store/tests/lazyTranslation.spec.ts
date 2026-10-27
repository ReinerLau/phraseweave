import { flushPromises } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Course } from "../exercise";
import { translatePracticeStep } from "~/services/generatorClient";
import { getLocalExercise, saveLocalExerciseTranslation } from "~/services/localExerciseDb";
import { useExerciseStore } from "../exercise";

vi.mock("~/services/generatorClient", () => ({ translatePracticeStep: vi.fn() }));
vi.mock("~/services/localExerciseDb", () => ({
  getLocalExercise: vi.fn(),
  saveLocalExercise: vi.fn().mockResolvedValue(undefined),
  saveLocalExerciseProgress: vi.fn().mockResolvedValue(undefined),
  saveLocalExerciseUnitPassed: vi.fn().mockResolvedValue(undefined),
  saveLocalExerciseTranslation: vi.fn().mockResolvedValue(undefined),
}));

describe("lazy sentence practice", () => {
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
      practiceSequence: "lazy-comma-segments-v1",
      statements: ["Read this, then write.", "Birds sing."].map((english, index) => ({
        id: `row-${index}`,
        order: index + 1,
        english,
        contextBefore: "",
        contextAfter: "",
        unitId: `${index}:whole`,
        sourceUnitIds: [],
      })),
    };
    vi.mocked(getLocalExercise).mockImplementation(async () => ({
      id: "pack",
      title: "文章",
      description: "",
      isFree: true,
      cover: "",
      courses: [course],
    }));
    vi.mocked(translatePracticeStep).mockImplementation(async (text) => ({
      chinese: `译：${text}`,
    }));
    vi.mocked(saveLocalExerciseTranslation).mockResolvedValue(undefined);
  });

  async function setup() {
    const store = useExerciseStore();
    await store.setup("pack", "course");
    return store;
  }

  it("translates each reached step, resumes it and reviews whole sentences", async () => {
    let store = await setup();
    expect(translatePracticeStep).toHaveBeenCalledTimes(1);
    expect(translatePracticeStep).toHaveBeenLastCalledWith("Read this");
    expect(store.currentStatement?.sentenceChinese).toBe("译：Read this");
    expect(store.currentPracticeText).toBe("Read this");
    store.passCurrentStatement();
    expect(store.advanceAfterCorrect()).toBe(false);
    await flushPromises();
    expect(translatePracticeStep).toHaveBeenLastCalledWith("then write.");
    expect(course.resumeStepIndex).toBe(1);

    setActivePinia(createPinia());
    store = await setup();
    expect(translatePracticeStep).toHaveBeenCalledTimes(2);
    expect(store.currentPracticeText).toBe("then write.");
    store.passCurrentStatement();
    store.advanceAfterCorrect();
    await flushPromises();
    expect(translatePracticeStep).toHaveBeenLastCalledWith("Read this, then write.");
    store.passCurrentStatement();
    store.advanceAfterCorrect();
    await flushPromises();
    expect(translatePracticeStep).toHaveBeenLastCalledWith("Birds sing.");
    expect(store.precedingSentences[0].chinese).toBe("译：Read this, then write.");
    store.passCurrentStatement();
    expect(store.advanceAfterCorrect()).toBe(true);
    store.doAgain();
    await flushPromises();
    expect(store.currentPracticeText).toBe("Read this, then write.");
    expect(translatePracticeStep).toHaveBeenCalledTimes(4);
  });

  it("retries a failed write without requesting the translation again", async () => {
    vi.mocked(saveLocalExerciseTranslation)
      .mockRejectedValueOnce(new Error("保存失败"))
      .mockResolvedValue(undefined);
    const store = await setup();
    expect(store.translationError).toBe("保存失败");
    expect(store.currentStatement?.sentenceChinese).toBe("");
    await store.ensureCurrentTranslation();
    expect(store.translationError).toBe("");
    expect(store.currentStatement?.sentenceChinese).toBe("译：Read this");
    expect(translatePracticeStep).toHaveBeenCalledTimes(1);
  });

  it("revisits a passed sentence as a whole and returns to the unfinished segment", async () => {
    course.statements[1].english = "Birds sing, then fly.";
    const store = await setup();
    store.passCurrentStatement();
    store.advanceAfterCorrect();
    await flushPromises();
    store.passCurrentStatement();
    store.advanceAfterCorrect();
    await flushPromises();
    store.passCurrentStatement();
    store.advanceAfterCorrect();
    await flushPromises();
    store.passCurrentStatement();
    store.advanceAfterCorrect();
    await flushPromises();
    expect(store.statementIndex).toBe(1);
    expect(course.resumeStatementIndex).toBe(1);
    expect(course.resumeStepIndex).toBe(1);
    expect(store.toSpecificStatement(0)).toBe(true);
    expect(store.currentPracticeText).toBe("Read this, then write.");
    expect(store.toSpecificStatement(1)).toBe(true);
    expect(store.currentPracticeText).toBe("then fly.");
    expect(course.resumeStepIndex).toBe(1);
  });

  it("keeps the current step available for retry after a translation failure", async () => {
    vi.mocked(translatePracticeStep)
      .mockRejectedValueOnce(new Error("请求超时"))
      .mockResolvedValue({ chinese: "读这个" });
    const store = await setup();
    expect(store.translationError).toBe("请求超时");
    expect(store.currentPracticeText).toBe("Read this");
    await store.ensureCurrentTranslation();
    expect(store.currentStatement?.sentenceChinese).toBe("读这个");
    expect(store.translationError).toBe("");
  });
});
