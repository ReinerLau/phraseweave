import { createTestingPinia } from "@pinia/testing";
import { enableAutoUnmount, mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useAnswerTip } from "~/composables/main/answerTip";
import { useGameMode } from "~/composables/main/game";
import { useSummary } from "~/composables/main/summary";
import { lookupPronunciation } from "~/services/pronunciation";
import { useExerciseStore } from "~/store/exercise";
import QuestionInput from "../QuestionInput.vue";

// Exercise the retained alternate modes independently of the temporary production restriction.
vi.mock("~/utils/practiceModes", () => ({
  practiceModeAvailability: { progressive: true, single: true },
}));

vi.mock("~/composables/useWordAudio", () => ({
  useWordAudio: () => ({
    loadingElement: undefined,
    playAutoWordAudio: vi.fn(),
    playAutoSentenceAudio: vi.fn(),
  }),
  findWordUnderInput: vi.fn(),
  playWordUnderInput: vi.fn(),
}));

vi.mock("~/services/pronunciation", () => ({ lookupPronunciation: vi.fn() }));
vi.mock("~/services/localExerciseDb", () => ({
  saveLocalExerciseProgress: vi.fn().mockResolvedValue(undefined),
}));
enableAutoUnmount(afterEach);

describe.each([false, true])("keyboard answer hints with word checking: %s", (wordChecking) => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(lookupPronunciation).mockReset().mockResolvedValue(["kəm", "ˈpjuː", "tər"]);
    localStorage.setItem("wordSpaceCheck", String(wordChecking));
    localStorage.setItem("keyboardSoundEnabled", "false");
    useAnswerTip().hiddenAnswerTip();
    useGameMode().showQuestion();
    useSummary().hideSummary();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    localStorage.removeItem("wordSpaceCheck");
    localStorage.removeItem("keyboardSoundEnabled");
  });

  function setup(english = "computer") {
    const pinia = createTestingPinia({ createSpy: vi.fn, stubActions: false });
    const store = useExerciseStore(pinia);
    store.currentCourse = {
      id: "course",
      coursePackId: "pack",
      title: "Test",
      order: 1,
      statementIndex: 0,
      completionCount: 0,
      learningMode: "progressive",
      practiceView: "single",
      statements: [{ id: "word", order: 1, english }],
    };
    store.currentStatement = store.currentCourse.statements[0];
    vi.spyOn(store, "failCurrentStatement").mockImplementation(() => {});
    vi.spyOn(store, "passCurrentStatement").mockImplementation(() => {});
    vi.spyOn(store, "advanceAfterCorrect").mockReturnValue(false);
    const wrapper = mount(QuestionInput, { attachTo: document.body, global: { plugins: [pinia] } });
    const input = wrapper.get("input");
    const enter = (extra = {}) =>
      input.trigger("keydown", { code: "Enter", key: "Enter", ...extra });
    const confirm = () => input.trigger("keydown", { code: "Space", key: " " });
    return { store, wrapper, input, enter, confirm };
  }

  it("waits for pronunciation, reveals on another empty Enter, and resumes typing", async () => {
    const { input, wrapper, store, enter, confirm } = setup();
    await enter();
    if (!wordChecking) {
      await vi.advanceTimersByTimeAsync(299);
      await enter();
      expect(useAnswerTip().isAnswerTip()).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
    }
    expect(wrapper.emitted("hint-change")?.at(-1)).toEqual([["kəm", "ˈpjuː", "tər"]]);
    expect(useAnswerTip().isAnswerTip()).toBe(false);
    await input.setValue(" ");
    await enter();
    expect(useAnswerTip().isAnswerTip()).toBe(true);
    expect(wrapper.get(".question-input-word").text()).toBe("computer");
    expect(store.failCurrentStatement).toHaveBeenCalledOnce();
    await enter();
    expect(useAnswerTip().isAnswerTip()).toBe(true);
    expect(store.passCurrentStatement).not.toHaveBeenCalled();
    expect(store.advanceAfterCorrect).not.toHaveBeenCalled();
    await input.setValue("computer");
    expect(useAnswerTip().isAnswerTip()).toBe(false);
    await confirm();
    expect(store.passCurrentStatement).toHaveBeenCalledOnce();
  });

  it("does not reveal incorrect or partial input even with pronunciation visible", async () => {
    const { input, store, enter } = setup();
    await enter();
    await vi.advanceTimersByTimeAsync(300);
    await input.setValue("compu");
    await enter();
    expect(useAnswerTip().isAnswerTip()).toBe(false);
    await vi.advanceTimersByTimeAsync(300);
    expect(useAnswerTip().isAnswerTip()).toBe(false);
    expect(store.failCurrentStatement).toHaveBeenCalledTimes(2);
    await enter();
    expect(useAnswerTip().isAnswerTip()).toBe(true);
  });

  it.each([undefined, []])(
    "allows a second empty Enter when pronunciation is %s",
    async (result) => {
      vi.mocked(lookupPronunciation).mockResolvedValue(result);
      const { enter } = setup();
      await enter();
      await vi.advanceTimersByTimeAsync(300);
      expect(useAnswerTip().isAnswerTip()).toBe(false);
      await enter();
      expect(useAnswerTip().isAnswerTip()).toBe(true);
    },
  );

  it("supports legacy phrases without offering pronunciation", async () => {
    const { enter } = setup("two words");
    await enter();
    await vi.advanceTimersByTimeAsync(300);
    expect(lookupPronunciation).not.toHaveBeenCalled();
    expect(useAnswerTip().isAnswerTip()).toBe(false);
    await enter();
    expect(useAnswerTip().isAnswerTip()).toBe(true);
  });

  it("does not reveal while a lookup is pending and allows resource failures to retry", async () => {
    let reject!: (error: Error) => void;
    vi.mocked(lookupPronunciation).mockReturnValueOnce(
      new Promise((_, fail) => {
        reject = fail;
      }),
    );
    const { enter } = setup();
    await enter();
    await vi.advanceTimersByTimeAsync(300);
    await enter();
    await vi.advanceTimersByTimeAsync(300);
    expect(lookupPronunciation).toHaveBeenCalledOnce();
    expect(useAnswerTip().isAnswerTip()).toBe(false);
    reject(new Error("resource unavailable"));
    await vi.advanceTimersByTimeAsync(0);
    await enter();
    expect(useAnswerTip().isAnswerTip()).toBe(false);
    await vi.advanceTimersByTimeAsync(300);
    expect(lookupPronunciation).toHaveBeenCalledTimes(2);
    await enter();
    expect(useAnswerTip().isAnswerTip()).toBe(true);
  });

  it("ignores composition, repeat keys, summary and completed states", async () => {
    const { enter, store } = setup();
    await enter();
    await vi.advanceTimersByTimeAsync(300);
    for (const extra of [{ repeat: true }, { isComposing: true }, { keyCode: 229 }]) {
      await enter(extra);
      expect(useAnswerTip().isAnswerTip()).toBe(false);
    }
    useSummary().showSummary();
    await enter();
    expect(useAnswerTip().isAnswerTip()).toBe(false);
    useSummary().hideSummary();
    store.fulltextCompleted = true;
    await enter();
    expect(useAnswerTip().isAnswerTip()).toBe(false);
  });

  it("does not propagate IME Enter to global navigation shortcuts", async () => {
    const { enter } = setup();
    const shortcut = vi.fn();
    window.addEventListener("keydown", shortcut);
    try {
      await enter({ isComposing: true });
      expect(shortcut).not.toHaveBeenCalled();
      expect(lookupPronunciation).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener("keydown", shortcut);
    }
  });

  it.each(["question", "view", "direction", "restart"])(
    "invalidates late lookups on %s changes",
    async (change) => {
      let resolve!: (value: string[]) => void;
      vi.mocked(lookupPronunciation).mockReturnValueOnce(
        new Promise((done) => {
          resolve = done;
        }),
      );
      const { store, wrapper, enter } = setup();
      await enter();
      await vi.advanceTimersByTimeAsync(300);
      if (change === "question")
        store.currentStatement = { id: "next", order: 2, english: "night" };
      if (change === "view") store.currentCourse!.practiceView = "fulltext";
      if (change === "direction") store.currentCourse!.learningMode = "sentence-first";
      if (change === "restart") store.doAgain();
      await wrapper.vm.$nextTick();
      resolve(["old"]);
      await vi.advanceTimersByTimeAsync(0);
      expect(wrapper.emitted("hint-change")?.at(-1)?.[0]).toBeUndefined();
      await enter();
      expect(useAnswerTip().isAnswerTip()).toBe(false);
      await vi.advanceTimersByTimeAsync(300);
      await enter();
      expect(useAnswerTip().isAnswerTip()).toBe(true);
    },
  );
});
