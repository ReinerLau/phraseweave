import { enableAutoUnmount, flushPromises, mount } from "@vue/test-utils";
import { createPinia, getActivePinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Course } from "~/store/exercise";
import { useContent } from "~/components/main/Contents/useContents";
import QuestionInput from "~/components/main/QuestionInput/QuestionInput.vue";
import Tool from "~/components/main/Tool.vue";
import { useAnswerTip } from "~/composables/main/answerTip";
import { useGameMode } from "~/composables/main/game";
import { useShowAnswer } from "~/composables/main/showAnswer";
import { useSummary } from "~/composables/main/summary";
import { getLocalExercise } from "~/services/localExerciseDb";
import { lookupPronunciation } from "~/services/pronunciation";
import { useExerciseStore } from "~/store/exercise";
import Question from "../Question.vue";

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

vi.mock("~/services/localExerciseDb", () => ({
  getLocalExercise: vi.fn(),
  saveLocalExerciseProgress: vi.fn().mockResolvedValue(undefined),
  saveLocalExerciseUnitPassed: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("~/services/pronunciation", () => ({ lookupPronunciation: vi.fn() }));
enableAutoUnmount(afterEach);

describe("answer availability", () => {
  let course: Course;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(lookupPronunciation).mockReset().mockResolvedValue(["kæts"]);
    localStorage.setItem("keyboardSoundEnabled", "false");
    localStorage.setItem("wordSpaceCheck", "false");
    setActivePinia(createPinia());
    useSummary().hideSummary();
    useGameMode().showQuestion();
    useAnswerTip().hiddenAnswerTip();
    course = {
      id: "course",
      title: "文章",
      coursePackId: "pack",
      order: 1,
      completionCount: 0,
      statementIndex: 4,
      learningMode: "sentence-first",
      statements: [
        { english: "Cats", contextBefore: "", contextAfter: " sleep quietly.", sources: [] },
        { english: "sleep", contextBefore: "Cats ", contextAfter: " quietly.", sources: [] },
        {
          english: "Cats sleep",
          contextBefore: "",
          contextAfter: " quietly.",
          sources: ["unit-0", "unit-1"],
        },
        { english: "quietly", contextBefore: "Cats sleep ", contextAfter: ".", sources: [] },
        {
          english: "Cats sleep quietly",
          contextBefore: "",
          contextAfter: ".",
          sources: ["unit-2", "unit-3"],
        },
      ].map(({ sources, ...unit }, index) => ({
        ...unit,
        id: `row-${index}`,
        order: index + 1,
        unitId: `unit-${index}`,
        sourceUnitIds: sources as [] | [string] | [string, string],
        sentenceChinese: "猫安静地睡觉。",
      })),
    };
    vi.mocked(getLocalExercise).mockImplementation(async () => ({
      id: "pack",
      title: "文章",
      description: "",
      cover: "",
      isFree: true,
      courses: [course],
    }));
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    localStorage.removeItem("keyboardSoundEnabled");
    localStorage.removeItem("wordSpaceCheck");
  });

  async function setup() {
    const pinia = getActivePinia()!;
    const store = useExerciseStore(pinia);
    await store.setup("pack", "course");
    const wrapper = mount(
      { components: { Question, Tool }, template: "<div><Tool/><Question/></div>" },
      {
        global: {
          plugins: [pinia],
          stubs: {
            MainQuestionInput: QuestionInput,
            MainContents: true,
            MainMessageBox: true,
            LearningModeSwitch: true,
            PracticeViewSwitch: true,
            NuxtLink: true,
            IconsExpand: true,
          },
        },
      },
    );
    return { store, wrapper };
  }

  it("does not offer sentence audio while answering, including with an answer hint", async () => {
    const { wrapper } = await setup();
    const sentence = wrapper.get('[data-testid="cloze-sentence"]');
    expect(sentence.find('[data-testid="sentence-audio-button"]').exists()).toBe(false);
    useAnswerTip().showAnswerTip();
    await wrapper.vm.$nextTick();
    expect(sentence.find('[data-testid="sentence-audio-button"]').exists()).toBe(false);
    expect(
      wrapper
        .get('[data-testid="practice-toolbar"]')
        .find('[data-testid="sentence-audio-button"]')
        .exists(),
    ).toBe(false);
  });

  it("shows a fixed directory label instead of the course title", async () => {
    course.title = "Cats sleep quietly";
    const { wrapper } = await setup();
    const toolbar = wrapper.get('[data-testid="practice-toolbar"]');
    const directoryButton = toolbar.get('[data-tip="练习卡片列表"]');
    const { hideContents, isShowContents } = useContent();

    expect(directoryButton.text()).toBe("目录");
    expect(toolbar.text()).not.toContain(course.title);
    expect(directoryButton.attributes("data-tip")).toBe("练习卡片列表");
    expect(isShowContents()).toBe(false);

    await directoryButton.trigger("click");
    expect(isShowContents()).toBe(true);
    hideContents();
  });

  it("shows lazy translation status in the prompt and locks input until ready", async () => {
    const { store, wrapper } = await setup();
    store.currentCourse!.practiceSequence = "lazy-comma-segments-v1";
    store.currentStatement!.sentenceChinese = "";
    store.translationLoading = true;
    await wrapper.vm.$nextTick();
    const prompt = wrapper.get('[data-testid="question-prompt"]').element;
    const input = wrapper.get('input[aria-label="填写当前英文单元"]');
    expect(wrapper.get('[data-testid="question-prompt"]').text()).toContain("正在翻译当前题");
    expect(input.attributes("disabled")).toBeDefined();
    expect(store.advanceAfterCorrect()).toBe(false);

    store.translationLoading = false;
    store.translationError = "请求超时";
    await wrapper.vm.$nextTick();
    expect(wrapper.get('[data-testid="question-prompt"]').element).toBe(prompt);
    expect(wrapper.get('[role="alert"]').text()).toBe("请求超时");
    const retry = vi.spyOn(store, "ensureCurrentTranslation").mockResolvedValue(undefined);
    await wrapper.get('[data-testid="question-prompt"] button').trigger("click");
    expect(retry).toHaveBeenCalledOnce();
    expect(input.attributes("disabled")).toBeDefined();

    store.translationError = "";
    store.currentStatement!.sentenceChinese = "猫安静地睡觉。";
    await wrapper.vm.$nextTick();
    expect(wrapper.get('[data-testid="question-prompt"]').element).toBe(prompt);
    expect(wrapper.get('[data-testid="question-prompt"]').text()).toBe("猫安静地睡觉。");
    expect(input.attributes("disabled")).toBeUndefined();
  });

  it("updates a query read before course setup and after reloading the same current unit", async () => {
    const store = useExerciseStore();
    expect(store.canDecomposeCurrentUnit).toBe(false);
    await store.setup("pack", "course");
    expect(store.canDecomposeCurrentUnit).toBe(true);
    course.statements[4].sourceUnitIds = [];
    await store.setup("pack", "course");
    expect(store.canDecomposeCurrentUnit).toBe(false);
  });

  async function reveal(wrapper: Awaited<ReturnType<typeof setup>>["wrapper"]) {
    const input = wrapper.get("input");
    await input.trigger("keydown", { code: "Enter", key: "Enter" });
    expect(useAnswerTip().isAnswerTip()).toBe(false);
    await vi.advanceTimersByTimeAsync(300);
    await input.trigger("keydown", { code: "Enter", key: "Enter" });
    expect(useAnswerTip().isAnswerTip()).toBe(true);
    expect(wrapper.find('[data-testid="show-answer-button"]').exists()).toBe(false);
  }

  it.each(["single", "fulltext"] as const)(
    "reveals a %s leaf by keyboard after displaying pronunciation",
    async (view) => {
      course.practiceView = view;
      course.learningMode = "progressive";
      course.statementIndex = 0;
      const { store, wrapper } = await setup();
      const input = wrapper.get("input");
      await input.trigger("keydown", { code: "Enter", key: "Enter" });
      await vi.advanceTimersByTimeAsync(300);
      expect(wrapper.get('[data-testid="phonetic-hint"]').text()).toContain("kæts");
      expect(useAnswerTip().isAnswerTip()).toBe(false);
      await input.trigger("keydown", { code: "Enter", key: "Enter" });
      expect(useAnswerTip().isAnswerTip()).toBe(true);
      expect(wrapper.get(".question-input-word").text()).toBe("Cats");
      expect(store.currentStatement?.unitId).toBe("unit-0");
      expect(wrapper.find('[data-testid="show-answer-button"]').exists()).toBe(false);
      await input.setValue("Cats");
      expect(useAnswerTip().isAnswerTip()).toBe(false);
      await input.trigger("keydown", { code: "Space", key: " " });
      expect(store.isStatementPassed(store.currentStatement!)).toBe(true);
      expect(useGameMode().isAnswer()).toBe(true);
    },
  );

  async function correct(store: ReturnType<typeof useExerciseStore>) {
    store.passCurrentStatement();
    store.advanceAfterCorrect();
    await flushPromises();
  }

  it.each(
    (
      [
        ["progressive", "single"],
        ["progressive", "fulltext"],
        ["sentence-first", "single"],
        ["sentence-first", "fulltext"],
      ] as const
    ).flatMap(([mode, view]) =>
      [false, true].map((wordChecking) => ({ mode, view, wordChecking })),
    ),
  )(
    "uses keyboard hints during nested recovery in $mode / $view with word checking: $wordChecking",
    async ({ mode, view, wordChecking }) => {
      localStorage.setItem("wordSpaceCheck", String(wordChecking));
      course.learningMode = mode;
      course.practiceView = view;
      const { store, wrapper } = await setup();
      const hasButton = () => wrapper.find('[data-testid="show-answer-button"]').exists();
      expect(store.canDecomposeCurrentUnit).toBe(true);
      expect(hasButton()).toBe(false);
      store.failCurrentStatement(); // AB is still decomposable.
      await flushPromises();
      expect(hasButton()).toBe(false);
      store.failCurrentStatement(); // A is a leaf.
      await flushPromises();
      expect(store.canDecomposeCurrentUnit).toBe(false);
      await reveal(wrapper);
      await wrapper.get("input").setValue("Cats");
      expect(useAnswerTip().isAnswerTip()).toBe(false);
      for (const [unit, canDecompose] of [
        ["unit-1", false],
        ["unit-2", true],
        ["unit-3", false],
        ["unit-4", true],
      ] as const) {
        await correct(store);
        expect(store.currentStatement?.unitId).toBe(unit);
        expect(store.canDecomposeCurrentUnit).toBe(canDecompose);
        expect(hasButton()).toBe(false);
      }
      expect(store.statementIndex).toBe(4);
      expect(store.isAnsweringBaseUnit).toBe(true);
    },
  );

  it("blocks proactive hints for a combination but preserves retry after a correct answer", async () => {
    const { store, wrapper } = await setup();
    const { toggleGameMode } = useShowAnswer();
    toggleGameMode();
    expect(useAnswerTip().isAnswerTip()).toBe(false);
    store.passCurrentStatement();
    useGameMode().showAnswer();
    toggleGameMode();
    expect(useGameMode().isQuestion()).toBe(true);
    expect(useAnswerTip().isAnswerTip()).toBe(false);
    expect(wrapper.find('[data-testid="show-answer-button"]').exists()).toBe(false);
  });

  it("treats a single valid source as decomposable", async () => {
    course.statements[4].sourceUnitIds = ["unit-3"];
    const { store, wrapper } = await setup();
    expect(store.canDecomposeCurrentUnit).toBe(true);
    expect(wrapper.find('[data-testid="show-answer-button"]').exists()).toBe(false);
    store.failCurrentStatement();
    await flushPromises();
    expect(store.currentStatement?.unitId).toBe("unit-3");
    expect(wrapper.find('[data-testid="show-answer-button"]').exists()).toBe(false);
    await correct(store);
    expect(wrapper.find('[data-testid="show-answer-button"]').exists()).toBe(false);
  });

  it.each([
    "no id",
    "no sources",
    "empty sources",
    "missing source",
    "later source",
    "self source",
  ])("keeps the answer entry when legacy data has %s", async (invalid) => {
    const whole = course.statements[4];
    if (invalid === "no id") whole.unitId = undefined;
    if (invalid === "no sources") whole.sourceUnitIds = undefined;
    if (invalid === "empty sources") whole.sourceUnitIds = [];
    if (invalid === "missing source") whole.sourceUnitIds = ["missing"];
    if (invalid === "self source") whole.sourceUnitIds = [whole.unitId!];
    if (invalid === "later source") {
      course.statements = [whole, ...course.statements.slice(0, 4)];
      course.statementIndex = 0;
    }
    const { store, wrapper } = await setup();
    expect(store.canDecomposeCurrentUnit).toBe(false);
    await reveal(wrapper);
    store.failCurrentStatement();
    expect(store.isRecovering).toBe(false);
    expect(store.currentStatement?.id).toBe(whole.id);
  });

  it("recomputes availability on view and direction switches, refresh and restart", async () => {
    const { store, wrapper } = await setup();
    store.failCurrentStatement();
    store.failCurrentStatement();
    store.switchPracticeView("fulltext");
    await flushPromises();
    expect(wrapper.find('[data-testid="show-answer-button"]').exists()).toBe(false);
    store.switchLearningMode("progressive");
    expect(store.canDecomposeCurrentUnit).toBe(false);
    store.switchLearningMode("sentence-first");
    await correct(store); // Initial leaf -> whole sentence.
    expect(wrapper.find('[data-testid="show-answer-button"]').exists()).toBe(false);
    store.failCurrentStatement();
    store.failCurrentStatement();
    setActivePinia(createPinia());
    const { store: refreshed, wrapper: restored } = await setup();
    expect(refreshed.currentStatement?.unitId).toBe("unit-4");
    expect(restored.find('[data-testid="show-answer-button"]').exists()).toBe(false);
    refreshed.doAgain();
    await flushPromises();
    expect(restored.find('[data-testid="show-answer-button"]').exists()).toBe(false);
    refreshed.switchLearningMode("progressive");
    refreshed.doAgain();
    await flushPromises();
    expect(refreshed.currentStatement?.unitId).toBe("unit-0");
    expect(restored.find('[data-testid="show-answer-button"]').exists()).toBe(false);
    await reveal(restored);
    refreshed.doAgain();
    await flushPromises();
    expect(useAnswerTip().isAnswerTip()).toBe(false);
    await reveal(restored);
  });
});
