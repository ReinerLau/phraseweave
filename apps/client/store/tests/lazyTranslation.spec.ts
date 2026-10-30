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
    await flushPromises();
    return store;
  }

  it("uses reconstructed text for translation, input, audio text, and resume", async () => {
    course.practiceSequence = "lazy-content-function-v1";
    course.statements = [
      {
        ...course.statements[0],
        english: "She quietly finished.",
        practiceSteps: [
          {
            kind: "segment",
            span: [0, 20],
            source_spans: [
              [0, 3],
              [12, 20],
            ],
            text: "She finished",
          },
          { kind: "sentence", span: [0, 21] },
        ],
      },
    ];
    let store = await setup();
    expect(store.currentStatement?.english).toBe("She finished");
    expect(store.currentPracticeText).toBe("She finished");
    expect(store.words).toEqual(["She", "finished"]);
    expect(store.checkCorrect("She finished")).toBe(true);
    expect(translatePracticeStep).toHaveBeenCalledWith("She finished");
    store.passCurrentStatement();
    store.advanceAfterCorrect();
    await flushPromises();
    setActivePinia(createPinia());
    store = await setup();
    expect(store.currentStatement?.english).toBe("She quietly finished.");
  });

  it("uses contextual word prompts, function-only answers, resume, and whole review", async () => {
    course.practiceSequence = "lazy-content-function-v1";
    course.statements = [
      {
        ...course.statements[0],
        english: "She put the book.",
        practiceSteps: [
          { kind: "content-word", span: [4, 7], context_span: [0, 17] },
          { kind: "content-word", span: [12, 16], context_span: [0, 17] },
          { kind: "function-fill", span: [0, 17], answer_word_indices: [0, 2] },
          { kind: "sentence", span: [0, 17] },
        ],
      },
    ];
    let store = await setup();
    expect(store.currentStatement?.english).toBe("put");
    expect(translatePracticeStep).toHaveBeenCalledWith("put", "She put the book.");
    store.passCurrentStatement();
    store.advanceAfterCorrect();
    await flushPromises();
    expect(course.resumeStepIndex).toBe(1);
    setActivePinia(createPinia());
    store = await setup();
    expect(store.currentStatement?.english).toBe("book");
    store.passCurrentStatement();
    store.advanceAfterCorrect();
    await flushPromises();
    expect(store.currentStatement?.english).toBe("She put the book.");
    expect(store.answerWordIndices).toEqual([0, 2]);
    expect(store.words).toEqual(["She", "the"]);
    expect(store.checkCorrect("She the")).toBe(true);
    expect(store.checkCorrect("She put the book")).toBe(false);
    store.passCurrentStatement();
    store.advanceAfterCorrect();
    await flushPromises();
    expect(store.words).toEqual(["She", "put", "the", "book"]);
    store.passCurrentStatement();
    expect(store.advanceAfterCorrect()).toBe(true);
    store.doAgain();
    await flushPromises();
    expect(store.currentStatement?.english).toBe("She put the book.");
  });

  it("uses saved clause steps for translation, resume, and whole-sentence review", async () => {
    course.practiceSequence = "lazy-clause-segments-v1";
    course.statements = [
      {
        ...course.statements[0],
        english: "I think that she is right.",
        practiceSpans: [
          [0, 7],
          [8, 25],
          [0, 26],
        ],
      },
    ];
    let store = await setup();
    expect(store.currentPracticeText).toBe("I think");
    expect(vi.mocked(translatePracticeStep).mock.calls.map(([text]) => text)).toEqual([
      "I think",
      "that she is right",
    ]);
    store.passCurrentStatement();
    store.advanceAfterCorrect();
    await flushPromises();
    expect(course.resumeStepIndex).toBe(1);
    expect(translatePracticeStep).toHaveBeenLastCalledWith("I think that she is right.");

    setActivePinia(createPinia());
    store = await setup();
    expect(store.currentPracticeText).toBe("that she is right");
    store.passCurrentStatement();
    store.advanceAfterCorrect();
    await flushPromises();
    expect(store.currentPracticeText).toBe("I think that she is right.");
    store.passCurrentStatement();
    expect(store.advanceAfterCorrect()).toBe(true);
    store.doAgain();
    await flushPromises();
    expect(store.currentPracticeText).toBe("I think that she is right.");
  });

  it("uses new punctuation steps and cached translations across a resumed first pass", async () => {
    course.practiceSequence = "lazy-punctuation-segments-v1";
    course.statements = [
      {
        ...course.statements[0],
        english: "Read this; then write.",
        practiceSpans: [
          [0, 9],
          [11, 22],
          [0, 22],
        ],
      },
    ];
    let store = await setup();
    expect(store.currentPracticeText).toBe("Read this");
    expect(vi.mocked(translatePracticeStep).mock.calls.map(([text]) => text)).toEqual([
      "Read this",
      "then write.",
    ]);
    store.passCurrentStatement();
    store.advanceAfterCorrect();
    await flushPromises();
    expect(course.resumeStepIndex).toBe(1);
    expect(store.currentPracticeText).toBe("then write.");
    expect(translatePracticeStep).toHaveBeenLastCalledWith("Read this; then write.");

    setActivePinia(createPinia());
    store = await setup();
    expect(store.currentPracticeText).toBe("then write.");
    expect(
      vi.mocked(translatePracticeStep).mock.calls.filter(([text]) => text === "then write."),
    ).toHaveLength(1);
    store.passCurrentStatement();
    store.advanceAfterCorrect();
    await flushPromises();
    expect(store.currentPracticeText).toBe("Read this; then write.");
    store.passCurrentStatement();
    expect(store.advanceAfterCorrect()).toBe(true);
    store.doAgain();
    await flushPromises();
    expect(store.currentPracticeText).toBe("Read this; then write.");
  });

  it("shows the course shell before the first translation completes", async () => {
    let finishCurrent!: (value: { chinese: string }) => void;
    vi.mocked(translatePracticeStep).mockImplementation(async (text) => {
      if (text === "Read this")
        return new Promise((resolve) => {
          finishCurrent = resolve;
        });
      return { chinese: `译：${text}` };
    });
    const store = useExerciseStore();
    await store.setup("pack", "course");
    expect(store.currentCourse?.id).toBe("course");
    expect(store.currentPracticeText).toBe("Read this");
    expect(store.translationLoading).toBe(true);
    expect(store.translationReady).toBe(false);
    expect(translatePracticeStep).toHaveBeenCalledTimes(1);
    finishCurrent({ chinese: "读这个" });
    await flushPromises();
    expect(store.translationReady).toBe(true);
    expect(translatePracticeStep).toHaveBeenLastCalledWith("then write.");
  });

  it("prefetches only the next step, resumes it and reviews whole sentences", async () => {
    let store = await setup();
    expect(vi.mocked(translatePracticeStep).mock.calls.map(([text]) => text)).toEqual([
      "Read this",
      "then write.",
    ]);
    expect(store.currentStatement?.sentenceChinese).toBe("译：Read this");
    expect(store.currentPracticeText).toBe("Read this");
    store.passCurrentStatement();
    expect(store.advanceAfterCorrect()).toBe(false);
    await flushPromises();
    expect(translatePracticeStep).toHaveBeenLastCalledWith("Read this, then write.");
    expect(course.resumeStepIndex).toBe(1);

    setActivePinia(createPinia());
    store = await setup();
    expect(translatePracticeStep).toHaveBeenCalledTimes(3);
    expect(store.currentPracticeText).toBe("then write.");
    store.passCurrentStatement();
    store.advanceAfterCorrect();
    await flushPromises();
    expect(translatePracticeStep).toHaveBeenLastCalledWith("Birds sing.");
    store.passCurrentStatement();
    store.advanceAfterCorrect();
    await flushPromises();
    expect(translatePracticeStep).toHaveBeenCalledTimes(4);
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
    expect(
      vi.mocked(translatePracticeStep).mock.calls.filter(([text]) => text === "Read this"),
    ).toHaveLength(1);
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

  it("joins an in-flight prefetch and blocks answering until it is saved", async () => {
    let finishNext!: (value: { chinese: string }) => void;
    vi.mocked(translatePracticeStep).mockImplementation(async (text) => {
      if (text === "then write.")
        return new Promise((resolve) => {
          finishNext = resolve;
        });
      return { chinese: `译：${text}` };
    });
    const store = await setup();
    expect(store.translationReady).toBe(true);
    expect(store.translationLoading).toBe(false);
    expect(translatePracticeStep).toHaveBeenCalledTimes(2);

    store.passCurrentStatement();
    store.advanceAfterCorrect();
    const joined = store.ensureCurrentTranslation();
    expect(store.currentPracticeText).toBe("then write.");
    expect(store.translationLoading).toBe(true);
    expect(store.translationReady).toBe(false);
    expect(store.checkCorrect("then write.")).toBe(false);
    store.passCurrentStatement();
    expect(store.advanceAfterCorrect()).toBe(false);
    expect(store.currentPracticeText).toBe("then write.");
    expect(translatePracticeStep).toHaveBeenCalledTimes(2);

    finishNext({ chinese: "然后写。" });
    await joined;
    await flushPromises();
    expect(store.translationReady).toBe(true);
    expect(store.currentStatement?.sentenceChinese).toBe("然后写。");
    expect(vi.mocked(translatePracticeStep).mock.calls.map(([text]) => text)).toEqual([
      "Read this",
      "then write.",
      "Read this, then write.",
    ]);
  });

  it("keeps a background failure silent until that step becomes current", async () => {
    let nextAttempts = 0;
    vi.mocked(translatePracticeStep).mockImplementation(async (text) => {
      if (text === "then write." && ++nextAttempts <= 2) throw new Error("请求超时");
      return { chinese: `译：${text}` };
    });
    const store = await setup();
    expect(store.translationError).toBe("");
    expect(store.translationReady).toBe(true);
    store.passCurrentStatement();
    store.advanceAfterCorrect();
    await flushPromises();
    expect(store.translationError).toBe("请求超时");
    expect(store.translationReady).toBe(false);
    await store.ensureCurrentTranslation();
    expect(store.translationError).toBe("");
    expect(store.translationReady).toBe(true);
    expect(nextAttempts).toBe(3);
  });

  it("retries a failed prefetch write without translating that step twice", async () => {
    let nextWrites = 0;
    vi.mocked(saveLocalExerciseTranslation).mockImplementation(
      async (_pack, _course, _index, step) => {
        if (step === 1 && ++nextWrites === 1) throw new Error("保存失败");
      },
    );
    const store = await setup();
    expect(store.translationError).toBe("");
    store.passCurrentStatement();
    store.advanceAfterCorrect();
    await flushPromises();
    expect(store.translationReady).toBe(true);
    expect(nextWrites).toBe(2);
    expect(
      vi.mocked(translatePracticeStep).mock.calls.filter(([text]) => text === "then write."),
    ).toHaveLength(1);
  });

  it("prefetches only whole sentences after completing the first pass", async () => {
    course.completionCount = 1;
    course.resumeStatementIndex = null;
    const store = await setup();
    expect(store.currentPracticeText).toBe("Read this, then write.");
    expect(vi.mocked(translatePracticeStep).mock.calls.map(([text]) => text)).toEqual([
      "Read this, then write.",
      "Birds sing.",
    ]);
  });

  it("uses a saved next-step translation without requesting it again", async () => {
    course.statements[0].stepTranslations = { 1: "然后写。" };
    const store = await setup();
    expect(store.currentStatement?.sentenceChinese).toBe("译：Read this");
    expect(vi.mocked(translatePracticeStep).mock.calls.map(([text]) => text)).toEqual([
      "Read this",
    ]);
    store.passCurrentStatement();
    store.advanceAfterCorrect();
    await flushPromises();
    expect(store.currentStatement?.sentenceChinese).toBe("然后写。");
    expect(vi.mocked(translatePracticeStep).mock.calls.map(([text]) => text)).toEqual([
      "Read this",
      "Read this, then write.",
    ]);
  });

  it("does not prefetch translations for an old comma-segment course", async () => {
    course.practiceSequence = "comma-segments-v1";
    for (const statement of course.statements) statement.sentenceChinese = "旧练习译文";
    await setup();
    expect(translatePracticeStep).not.toHaveBeenCalled();
  });
});
