import { createTestingPinia } from "@pinia/testing";
import { enableAutoUnmount, mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import Contents from "~/components/main/Contents/Contents.vue";
import { useContent } from "~/components/main/Contents/useContents";
import { useAnswerTip } from "~/composables/main/answerTip";
import { useExerciseNavigation } from "~/composables/main/exerciseNavigation";
import { useGameMode } from "~/composables/main/game";
import { useWordAudio } from "~/composables/useWordAudio";
import { lookupPronunciation } from "~/services/pronunciation";
import { useExerciseStore } from "~/store/exercise";
import QuestionInput from "../QuestionInput.vue";

// Exercise the retained alternate modes independently of the temporary production restriction.
vi.mock("~/utils/practiceModes", () => ({
  practiceModeAvailability: { progressive: true, single: true },
}));

vi.mock("~/composables/useWordAudio", () => {
  const playAutoWordAudio = vi.fn();
  const playAutoSentenceAudio = vi.fn();
  return {
    useWordAudio: () => ({
      loadingElement: undefined,
      playAutoWordAudio,
      playAutoSentenceAudio,
    }),
    findWordUnderInput: vi.fn(),
    playWordUnderInput: vi.fn(),
  };
});

vi.mock("~/services/pronunciation", () => ({ lookupPronunciation: vi.fn() }));

enableAutoUnmount(afterEach);

describe("QuestionInput", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(lookupPronunciation).mockReset().mockResolvedValue(["kəm", "ˈpjuː", "tər"]);
    useAnswerTip().hiddenAnswerTip();
    useGameMode().showQuestion();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  function mountQuestionInput(
    english = "I eat",
    context: { contextBefore?: string; contextAfter?: string; answerWordIndices?: number[] } = {},
  ) {
    const pinia = createTestingPinia({ createSpy: vi.fn });
    const courseStore = useExerciseStore(pinia);
    courseStore.currentStatement = {
      id: "1",
      order: 1,
      english,
      chinese: "我吃",
      soundmark: "/aɪ iːt/",
      ...context,
    };

    const wrapper = mount(QuestionInput, {
      global: {
        plugins: [pinia],
      },
    });

    return { input: wrapper.get('input[type="text"]'), wrapper, store: courseStore };
  }

  it("shows practiced content words while accepting only function words", async () => {
    const { input, wrapper, store } = mountQuestionInput("She put the book.", {
      answerWordIndices: [0, 2],
    });
    expect(
      wrapper.findAll('[data-testid="fixed-practice-word"]').map((word) => word.text()),
    ).toEqual(["put", "book"]);
    for (const word of wrapper.findAll('[data-testid="fixed-practice-word"]')) {
      expect(word.classes()).toContain("border-b-2");
      expect(word.classes()).toContain("border-b-transparent");
      expect(word.classes()).toContain("leading-none");
    }
    expect(wrapper.findAll(".question-input-word[data-word-index]")).toHaveLength(2);
    await submitAnswer(input, "She the");
    expect(store.passCurrentStatement).toHaveBeenCalledOnce();
  });

  it("rolls back on the current function word without replaying fixed content words", async () => {
    const { input, store } = mountQuestionInput("She put the book.", {
      answerWordIndices: [0, 2],
    });
    await rollbackAnswer(input, "She ");
    await vi.advanceTimersByTimeAsync(300);
    expect(store.failCurrentStatement).toHaveBeenCalledWith("She ", 1);
  });

  async function submitAnswer(
    input: ReturnType<typeof mountQuestionInput>["input"],
    value: string,
  ) {
    (input.element as HTMLInputElement).focus();
    await input.setValue(value);
    await input.trigger("keydown", { code: "Space", key: " " });
  }

  async function rollbackAnswer(
    input: ReturnType<typeof mountQuestionInput>["input"],
    value: string,
  ) {
    (input.element as HTMLInputElement).focus();
    await input.setValue(value);
    await input.trigger("keydown", { code: "Enter", key: "Enter" });
  }

  it("cancels a pending recovery when the full answer is submitted with space in time", async () => {
    const { input, store } = mountQuestionInput("I like apples very much");
    await rollbackAnswer(input, "I lik");
    expect(vi.getTimerCount()).toBe(1);
    await submitAnswer(input, "I like apples very much");
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(300);
    expect(store.failCurrentStatement).not.toHaveBeenCalled();
    expect(store.passCurrentStatement).toHaveBeenCalledOnce();
  });

  it("rolls back with Enter instead of submitting a correct answer", async () => {
    const { input, store } = mountQuestionInput("I eat");
    await rollbackAnswer(input, "I eat");
    expect(store.passCurrentStatement).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(300);
    expect(store.failCurrentStatement).toHaveBeenCalledWith("I ", 1);
    expect((input.element as HTMLInputElement).value).toBe("");
  });

  it.each([
    { english: "I like apples very much", value: "", snapshot: "", index: 0, errors: 1 },
    {
      english: "I like apples very much",
      value: "I like ",
      snapshot: "I like ",
      index: 2,
      errors: 1,
    },
    {
      english: "I like apples very much",
      value: "X like app",
      snapshot: "X like app",
      index: 2,
      errors: 2,
    },
    { english: "Don't go home", value: "DON’T ", snapshot: "DON’T ", index: 1, errors: 1 },
    {
      english: "I like apples very much",
      value: "X lik apples",
      snapshot: "X lik apples",
      index: 2,
      errors: 2,
    },
    { english: "woman's coat is red", value: "woman'z", snapshot: "woman'z", index: 0, errors: 1 },
    { english: "anti-social work", value: "anti-", snapshot: "anti ", index: 1, errors: 1 },
  ])(
    "limits feedback and recovery to the current word for '$value'",
    async ({ english, value, snapshot, index, errors }) => {
      const { input, wrapper, store } = mountQuestionInput(english);
      await rollbackAnswer(input, value);
      expect(wrapper.findAll(".question-input-word.border-b-red-500")).toHaveLength(errors);
      await vi.advanceTimersByTimeAsync(300);
      expect(store.failCurrentStatement).toHaveBeenCalledWith(snapshot, index);
      expect(store.passCurrentStatement).not.toHaveBeenCalled();
    },
  );

  it("freezes the current word boundary even if typing continues during feedback", async () => {
    const { input, store } = mountQuestionInput("I like apples very much");
    await rollbackAnswer(input, "I like ");
    await input.setValue("I like apples very");
    await vi.advanceTimersByTimeAsync(300);
    expect(store.failCurrentStatement).toHaveBeenCalledWith("I like ", 2);
  });

  it("reveals syllables after the error delay, keeps them on retry, and clears on success", async () => {
    const { input, wrapper } = mountQuestionInput("computer");
    const width = wrapper.get(".question-input-word").attributes("style");
    expect(wrapper.emitted("hint-change")?.at(-1)?.[0]).toBeUndefined();
    await rollbackAnswer(input, "x");
    await vi.advanceTimersByTimeAsync(299);
    expect(wrapper.emitted("hint-change")?.at(-1)?.[0]).toBeUndefined();
    await vi.advanceTimersByTimeAsync(1);
    expect(wrapper.emitted("hint-change")?.at(-1)).toEqual([["kəm", "ˈpjuː", "tər"]]);
    expect(wrapper.find('[data-testid="phonetic-hint"]').exists()).toBe(false);
    expect((input.element as HTMLInputElement).value).toBe("");
    expect(wrapper.get(".question-input-word").attributes("style")).toBe(width);
    await rollbackAnswer(input, "x");
    await vi.advanceTimersByTimeAsync(300);
    expect(wrapper.emitted("hint-change")?.at(-1)).toEqual([["kəm", "ˈpjuː", "tər"]]);
    await submitAnswer(input, "computer");
    expect(wrapper.emitted("hint-change")?.at(-1)?.[0]).toBeUndefined();
  });

  it("does not hint phrases, decomposable words, or unknown words", async () => {
    const phrase = mountQuestionInput("two words");
    await rollbackAnswer(phrase.input, "x");
    await vi.advanceTimersByTimeAsync(300);
    expect(lookupPronunciation).not.toHaveBeenCalled();
    phrase.wrapper.unmount();
    const word = mountQuestionInput("computer");
    const store = useExerciseStore();
    Object.defineProperty(store, "canDecomposeCurrentUnit", { configurable: true, value: true });
    await rollbackAnswer(word.input, "x");
    await vi.advanceTimersByTimeAsync(300);
    expect(lookupPronunciation).not.toHaveBeenCalled();
    word.wrapper.unmount();
    vi.mocked(lookupPronunciation).mockResolvedValueOnce(undefined);
    const unknown = mountQuestionInput("xyzxyzunknown");
    await rollbackAnswer(unknown.input, "x");
    await vi.advanceTimersByTimeAsync(300);
    expect(unknown.wrapper.emitted("hint-change")?.at(-1)?.[0]).toBeUndefined();
  });

  it("discards late lookups after a new question or a correct answer", async () => {
    let resolve!: (value: string[]) => void;
    vi.mocked(lookupPronunciation).mockReturnValueOnce(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const { input, wrapper } = mountQuestionInput("computer");
    await rollbackAnswer(input, "x");
    await vi.advanceTimersByTimeAsync(300);
    useExerciseStore().currentStatement = { id: "next", order: 2, english: "night" };
    await wrapper.vm.$nextTick();
    resolve(["old"]);
    await wrapper.vm.$nextTick();
    expect(wrapper.emitted("hint-change")?.at(-1)?.[0]).toBeUndefined();
    vi.mocked(lookupPronunciation).mockReturnValueOnce(
      new Promise((done) => {
        resolve = done;
      }),
    );
    await rollbackAnswer(input, "x");
    await vi.advanceTimersByTimeAsync(300);
    await submitAnswer(input, "night");
    resolve(["old"]);
    await wrapper.vm.$nextTick();
    expect(wrapper.emitted("hint-change")?.at(-1)?.[0]).toBeUndefined();
  });

  it("clears a visible hint when changing the view on the same word", async () => {
    const { input, wrapper, store } = mountQuestionInput("computer");
    store.currentCourse = {
      id: "course",
      title: "练习",
      order: 1,
      coursePackId: "pack",
      completionCount: 0,
      statementIndex: 0,
      statements: [store.currentStatement!],
    };
    await rollbackAnswer(input, "x");
    await vi.advanceTimersByTimeAsync(300);
    expect(wrapper.emitted("hint-change")?.at(-1)).toEqual([["kəm", "ˈpjuː", "tər"]]);
    store.currentCourse.practiceView = "fulltext";
    await wrapper.vm.$nextTick();
    expect(wrapper.emitted("hint-change")?.at(-1)?.[0]).toBeUndefined();
  });

  it("shows an incorrect answer briefly before resetting the input", async () => {
    const { input, wrapper } = mountQuestionInput();
    await wrapper.vm.$nextTick();

    await submitAnswer(input, "I like");
    await wrapper.vm.$nextTick();
    const submittedInput = (input.element as HTMLInputElement).value;

    expect((input.element as HTMLInputElement).value).not.toBe("");
    expect(wrapper.findAll(".question-input-word")).toHaveLength(2);
    expect(wrapper.findAll(".question-input-word.border-b-red-500")).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(299);
    expect((input.element as HTMLInputElement).value).not.toBe("");

    await vi.advanceTimersByTimeAsync(1);
    await wrapper.vm.$nextTick();

    expect((input.element as HTMLInputElement).value).toBe("");
    expect(wrapper.findAll(".question-input-word.border-b-red-500")).toHaveLength(0);
    expect(wrapper.find(".question-input-word").classes()).toContain("border-b-fuchsia-500");
    expect(useExerciseStore().failCurrentStatement).toHaveBeenCalledWith(submittedInput, 1);
  });

  it("uses the submitted snapshot even when input changes during error feedback", async () => {
    const { input } = mountQuestionInput();
    await submitAnswer(input, "I like");
    const submittedInput = (input.element as HTMLInputElement).value;
    await input.setValue("I eat");
    await vi.advanceTimersByTimeAsync(300);
    expect(useExerciseStore().failCurrentStatement).toHaveBeenCalledWith(submittedInput, 1);
  });

  it("replaces a pending reset for a newer incorrect answer", async () => {
    const { input, wrapper } = mountQuestionInput();
    await wrapper.vm.$nextTick();

    await submitAnswer(input, "I like");
    await wrapper.vm.$nextTick();
    await vi.advanceTimersByTimeAsync(200);

    await submitAnswer(input, "I love");
    await wrapper.vm.$nextTick();
    const submittedInput = (input.element as HTMLInputElement).value;
    await vi.advanceTimersByTimeAsync(200);

    expect((input.element as HTMLInputElement).value).not.toBe("");

    await vi.advanceTimersByTimeAsync(100);
    await wrapper.vm.$nextTick();
    expect((input.element as HTMLInputElement).value).toBe("");
    expect(useExerciseStore().failCurrentStatement).toHaveBeenCalledOnce();
    expect(useExerciseStore().failCurrentStatement).toHaveBeenCalledWith(submittedInput, 1);
  });

  it("cancels a pending reset after a correct answer", async () => {
    const { input, wrapper } = mountQuestionInput();
    await wrapper.vm.$nextTick();

    await submitAnswer(input, "I like");
    await wrapper.vm.$nextTick();
    await submitAnswer(input, "I eat");
    await wrapper.vm.$nextTick();

    expect(vi.getTimerCount()).toBe(0);
  });

  it("cleans up a pending reset when unmounted", async () => {
    const { input, wrapper } = mountQuestionInput();
    await wrapper.vm.$nextTick();

    await submitAnswer(input, "I like");
    await wrapper.vm.$nextTick();
    expect(vi.getTimerCount()).toBe(1);

    wrapper.unmount();

    expect(vi.getTimerCount()).toBe(0);
  });

  it("cancels an old error callback when the mode changes on the same unit", async () => {
    const { input, wrapper } = mountQuestionInput();
    await submitAnswer(input, "I like");
    const store = useExerciseStore();
    store.currentCourse = {
      id: "course",
      title: "练习",
      order: 1,
      coursePackId: "pack",
      completionCount: 0,
      statementIndex: 0,
      statements: [store.currentStatement!],
    };
    store.currentCourse.learningMode = "sentence-first";
    await wrapper.vm.$nextTick();
    expect(vi.getTimerCount()).toBe(0);
    expect((input.element as HTMLInputElement).value).toBe("");
    await vi.advanceTimersByTimeAsync(300);
    expect(store.failCurrentStatement).not.toHaveBeenCalled();
  });

  it("keeps the answer tip for Han input and hides it for symbols or digits", async () => {
    const { input, wrapper } = mountQuestionInput("S$500");
    const { showAnswerTip, isAnswerTip } = useAnswerTip();
    showAnswerTip();
    await wrapper.vm.$nextTick();

    await input.setValue("中");
    expect(isAnswerTip()).toBe(true);
    expect((input.element as HTMLInputElement).value).toBe("");

    await input.setValue("$");
    expect(isAnswerTip()).toBe(false);
    expect((input.element as HTMLInputElement).value).toBe("$");

    showAnswerTip();
    await wrapper.vm.$nextTick();
    await input.setValue("5");
    expect(isAnswerTip()).toBe(false);
    expect((input.element as HTMLInputElement).value).toBe("5");

    await submitAnswer(input, "S$500");
  });

  it("cancels a pending error when the practice view changes on the same unit", async () => {
    const { input, wrapper } = mountQuestionInput();
    const store = useExerciseStore();
    store.currentCourse = {
      id: "course",
      title: "文章",
      order: 1,
      coursePackId: "pack",
      completionCount: 0,
      statementIndex: 0,
      statements: [store.currentStatement!],
    };
    await wrapper.vm.$nextTick();
    await submitAnswer(input, "I like");
    store.currentCourse.practiceView = "fulltext";
    await wrapper.vm.$nextTick();
    expect(vi.getTimerCount()).toBe(0);
    expect((input.element as HTMLInputElement).value).toBe("");
    await vi.advanceTimersByTimeAsync(300);
    expect(store.failCurrentStatement).not.toHaveBeenCalled();
  });

  it("clears input, tips and a pending error and focuses the target after a directory jump", async () => {
    useGameMode().showQuestion();
    const pinia = createTestingPinia({ createSpy: vi.fn, stubActions: false });
    const store = useExerciseStore(pinia);
    store.currentCourse = {
      id: "course",
      title: "文章",
      order: 1,
      coursePackId: "pack",
      completionCount: 0,
      statementIndex: 0,
      practiceView: "fulltext",
      passedUnitIds: ["unit:1"],
      statements: ["I eat", "Birds sing"].map((english, index) => ({
        id: String(index),
        order: index + 1,
        english,
        unitId: String(index),
        sourceUnitIds: [],
        contextBefore: "",
        contextAfter: ".",
        sentenceChinese: index ? "鸟在歌唱。" : "我吃饭。",
      })),
    };
    store.statementIndex = 0;
    store.currentStatement = store.currentCourse.statements[0];
    const wrapper = mount(QuestionInput, { attachTo: document.body, global: { plugins: [pinia] } });
    const contents = mount(Contents, { attachTo: document.body, global: { plugins: [pinia] } });
    const input = wrapper.get('input[type="text"]');
    await submitAnswer(input, "I like");
    expect(vi.getTimerCount()).toBe(1);
    useGameMode().showAnswer();
    useAnswerTip().showAnswerTip();
    const directory = useContent();
    directory.toggleContents(new MouseEvent("click"));
    expect(directory.isShowContents()).toBe(true);
    await contents.findAll("button")[1].trigger("click");
    await wrapper.vm.$nextTick();
    expect(store.statementIndex).toBe(1);
    expect(store.currentStatement?.english).toBe("Birds sing");
    expect(useGameMode().isQuestion()).toBe(true);
    expect(useAnswerTip().isAnswerTip()).toBe(false);
    expect(directory.isShowContents()).toBe(false);
    expect((input.element as HTMLInputElement).value).toBe("");
    expect(document.activeElement).toBe(input.element);
    await vi.advanceTimersByTimeAsync(300);
    expect(store.failCurrentStatement).not.toHaveBeenCalled();
    expect(store.advanceAfterCorrect()).toBe(false);
    await input.setValue("Birds");
    useAnswerTip().showAnswerTip();
    await contents.findAll("button")[0].trigger("click");
    await wrapper.vm.$nextTick();
    expect(store.statementIndex).toBe(0);
    expect(store.currentStatement?.english).toBe("I eat");
    expect((input.element as HTMLInputElement).value).toBe("");
    expect(useAnswerTip().isAnswerTip()).toBe(false);
    expect(document.activeElement).toBe(input.element);
    expect(store.advanceAfterCorrect()).toBe(false);
  });

  it("keeps the original sentence punctuation visible before input, in tips, and after input", async () => {
    const sentence =
      "The new penalties will also be applied to other anti-social behaviour, such as putting feet on seats, littering, and eating or drinking on buses";
    const { input, wrapper } = mountQuestionInput(sentence);
    await wrapper.vm.$nextTick();
    const punctuation = () => wrapper.findAll(".cloze-punctuation").map((part) => part.text());
    expect(punctuation()).toEqual(["-", ",", ",", ","]);
    expect(wrapper.findAll(".question-input-word")).toHaveLength(25);
    expect(wrapper.findAll(".cloze-punctuation.border-b-2")).toHaveLength(0);
    expect(
      wrapper.findAll(".question-input-group")[9].findAll(".question-input-word"),
    ).toHaveLength(2);

    const { showAnswerTip, isAnswerTip } = useAnswerTip();
    showAnswerTip();
    await wrapper.vm.$nextTick();
    expect(
      wrapper
        .findAll(".question-input-word")
        .map((part) => part.text())
        .slice(9, 12),
    ).toEqual(["anti", "social", "behaviour"]);
    await input.setValue(",.-");
    expect(isAnswerTip()).toBe(true);
    expect((input.element as HTMLInputElement).value).toBe("");

    await input.setValue(sentence);
    expect(isAnswerTip()).toBe(false);
    expect((input.element as HTMLInputElement).value).toBe(
      sentence.replace("-", " ").replaceAll(",", ""),
    );
    expect(punctuation()).toEqual(["-", ",", ",", ","]);
    await input.trigger("keydown", { code: "Space", key: " " });
    expect(useExerciseStore().passCurrentStatement).toHaveBeenCalledOnce();
    expect(useExerciseStore().failCurrentStatement).not.toHaveBeenCalled();
  });

  it("keeps an apostrophe while a contraction is being typed", async () => {
    const { input } = mountQuestionInput("don’t");
    await input.setValue("don'");
    expect((input.element as HTMLInputElement).value).toBe("don'");
    await submitAnswer(input, "don't");
    expect(useExerciseStore().passCurrentStatement).toHaveBeenCalledOnce();
  });

  it("auto-plays the containing sentence when a unit is answered correctly", async () => {
    vi.clearAllMocks();
    const { input } = mountQuestionInput("apples", {
      contextBefore: "I eat ",
      contextAfter: ".",
    });
    await submitAnswer(input, "apples");
    expect(useExerciseStore().passCurrentStatement).toHaveBeenCalledOnce();
    expect(useWordAudio().playAutoSentenceAudio).toHaveBeenCalledWith("I eat apples.");
    expect(useWordAudio().playAutoWordAudio).not.toHaveBeenCalled();
  });

  it.each([false, true])(
    "advances fulltext only on a correct submission (auto-next: %s)",
    async (autoNext) => {
      localStorage.setItem("autoNextQuestion", String(autoNext));
      useGameMode().showQuestion();
      const pinia = createTestingPinia({ createSpy: vi.fn, stubActions: false });
      const store = useExerciseStore(pinia);
      store.currentCourse = {
        id: "course",
        title: "文章",
        order: 1,
        coursePackId: "pack",
        completionCount: 0,
        statementIndex: 0,
        practiceView: "fulltext",
        statements: ["I eat", "Birds sing"].map((english, index) => ({
          id: String(index),
          order: index + 1,
          english,
          unitId: String(index),
          sourceUnitIds: [],
          contextBefore: "",
          contextAfter: ".",
          sentenceChinese: index ? "鸟在歌唱。" : "我吃饭。",
        })),
      };
      store.statementIndex = 0;
      store.currentStatement = store.currentCourse.statements[0];
      const wrapper = mount(QuestionInput, { global: { plugins: [pinia] } });
      const input = wrapper.get('input[type="text"]');
      useAnswerTip().showAnswerTip();
      await wrapper.vm.$nextTick();
      await input.trigger("keydown", { code: "Enter", key: "Enter" });
      expect(store.passCurrentStatement).not.toHaveBeenCalled();
      expect(store.statementIndex).toBe(0);
      await submitAnswer(input, "I eat");
      expect(store.passCurrentStatement).toHaveBeenCalledOnce();
      if (!autoNext) {
        expect(store.statementIndex).toBe(0);
        expect(store.precedingSentences).toHaveLength(0);
        expect(useGameMode().isAnswer()).toBe(true);
        useExerciseNavigation().goToNextQuestion();
      }
      expect(store.statementIndex).toBe(1);
      expect(store.precedingSentences).toHaveLength(1);
      localStorage.removeItem("autoNextQuestion");
    },
  );
});
