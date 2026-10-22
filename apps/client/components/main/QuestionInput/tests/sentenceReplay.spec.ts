import { createTestingPinia } from "@pinia/testing";
import { enableAutoUnmount, mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Course } from "~/store/exercise";
import { useAnswerTip } from "~/composables/main/answerTip";
import { useGameMode } from "~/composables/main/game";
import { useSummary } from "~/composables/main/summary";
import { getLocalExercise } from "~/services/localExerciseDb";
import { lookupPronunciation } from "~/services/pronunciation";
import { useExerciseStore } from "~/store/exercise";
import QuestionInput from "../QuestionInput.vue";

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
  getLocalExercise: vi.fn(),
  saveLocalExercise: vi.fn().mockResolvedValue(undefined),
  saveLocalExerciseProgress: vi.fn().mockResolvedValue(undefined),
  saveLocalExerciseUnitPassed: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../useCorrectSound", () => ({ useCorrectSound: () => ({ playCorrectSound: vi.fn() }) }));

enableAutoUnmount(afterEach);

describe("sentence token replay", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.setItem("wordSpaceCheck", "false");
    localStorage.setItem("keyboardSoundEnabled", "false");
    localStorage.setItem("autoNextQuestion", "true");
    vi.mocked(lookupPronunciation).mockResolvedValue(["ˈæ", "pəlz"]);
    useGameMode().showQuestion();
    useAnswerTip().hiddenAnswerTip();
    useSummary().hideSummary();
  });

  afterEach(() => {
    for (const key of ["wordSpaceCheck", "keyboardSoundEnabled", "autoNextQuestion"])
      localStorage.removeItem(key);
  });

  async function setup(sentences = ["I like apples.", "Birds sing."]) {
    const course: Course = {
      id: "course",
      coursePackId: "pack",
      title: "Test",
      order: 1,
      statementIndex: 0,
      completionCount: 0,
      statements: sentences.map((english, index) => ({
        id: String(index),
        unitId: `${index}:0`,
        order: index + 1,
        english,
        contextBefore: "",
        contextAfter: "",
        sentenceChinese: `第${index + 1}句。`,
        sourceUnitIds: [],
      })),
    };
    vi.mocked(getLocalExercise).mockResolvedValue({
      id: "pack",
      title: "Test",
      description: "",
      isFree: true,
      cover: "",
      courses: [course],
    });
    const pinia = createTestingPinia({ createSpy: vi.fn, stubActions: false });
    const store = useExerciseStore(pinia);
    await store.setup("pack", "course");
    const wrapper = mount(QuestionInput, { global: { plugins: [pinia] } });
    const input = wrapper.get("input");
    const press = (code: "Space" | "Enter") =>
      input.trigger("keydown", { code, key: code === "Space" ? " " : "Enter" });
    const wordTexts = () => wrapper.findAll(".question-input-word").map((word) => word.text());
    const answer = async (word: string) => {
      await input.setValue(word);
      await press("Space");
    };
    return { store, wrapper, input, press, wordTexts, answer };
  }

  it("shows only the current token and restarts after assisted confirmation", async () => {
    const { store, wrapper, input, press, wordTexts, answer } = await setup();
    expect(input.attributes("maxlength")).toBe("1");
    await answer("I");
    await answer("like");
    await press("Enter");
    await wrapper.vm.$nextTick();
    expect(lookupPronunciation).toHaveBeenCalledWith("apples");
    expect(wordTexts()).toEqual(["I", "like", ""]);
    expect(store.isRecovering).toBe(false);
    await press("Enter");
    expect(wordTexts()).toEqual(["I", "like", "apples"]);
    const wordsDuringHint = wrapper.findAll(".question-input-word");
    expect(wordsDuringHint[0].classes()).toContain("border-b-transparent");
    expect(wordsDuringHint[1].classes()).toContain("border-b-transparent");
    expect(wordsDuringHint[2].classes()).toContain("text-gray-400");
    await answer("apples");
    expect(wordTexts()).toEqual(["", "", ""]);
    expect(store.statementIndex).toBe(0);
    expect(store.currentCourse?.passedUnitIds).toBeUndefined();
    await answer("I");
    await answer("like");
    await answer("apples");
    expect(store.statementIndex).toBe(1);
    expect(store.currentCourse?.passedUnitIds).toEqual(["unit:0:0"]);
  });

  it("keeps a wrong Space on the current token and replays after first-stage help", async () => {
    const { store, wrapper, input, press, wordTexts, answer } = await setup(["Don't go."]);
    await input.setValue("Don");
    await press("Space");
    expect(wordTexts()).toEqual(["Don", ""]);
    await press("Enter");
    await wrapper.vm.$nextTick();
    expect(lookupPronunciation).toHaveBeenCalledWith("Don't");
    await answer("DON’T");
    expect(wordTexts()).toEqual(["", ""]);
    await answer("Don't");
    await answer("go");
    expect(store.currentCourse?.passedUnitIds).toEqual(["unit:0:0"]);
  });
});
