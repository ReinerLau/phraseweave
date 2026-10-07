import { enableAutoUnmount, flushPromises, mount } from "@vue/test-utils";
import { createPinia, getActivePinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Course } from "~/store/exercise";
import Tool from "~/components/main/Tool.vue";
import { useAnswerTip } from "~/composables/main/answerTip";
import { useGameMode } from "~/composables/main/game";
import { useShowAnswer } from "~/composables/main/showAnswer";
import { useSummary } from "~/composables/main/summary";
import { getLocalExercise } from "~/services/localExerciseDb";
import { useExerciseStore } from "~/store/exercise";
import Question from "../Question.vue";

vi.mock("~/services/localExerciseDb", () => ({
  getLocalExercise: vi.fn(),
  saveLocalExerciseProgress: vi.fn().mockResolvedValue(undefined),
  saveLocalExerciseUnitPassed: vi.fn().mockResolvedValue(undefined),
}));
enableAutoUnmount(afterEach);

describe("answer availability", () => {
  let course: Course;

  beforeEach(() => {
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
            MainQuestionInput: true,
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

  it("updates a query read before course setup and after reloading the same current unit", async () => {
    const store = useExerciseStore();
    expect(store.canDecomposeCurrentUnit).toBe(false);
    await store.setup("pack", "course");
    expect(store.canDecomposeCurrentUnit).toBe(true);
    course.statements[4].sourceUnitIds = [];
    await store.setup("pack", "course");
    expect(store.canDecomposeCurrentUnit).toBe(false);
  });

  it("moves the fulltext leaf hint to the toolbar and hides it in answer and summary states", async () => {
    course.practiceView = "fulltext";
    course.learningMode = "progressive";
    course.statementIndex = 0;
    const { store, wrapper } = await setup();
    expect(wrapper.findComponent(Question).find("button").exists()).toBe(false);
    expect(wrapper.findComponent(Tool).find('button[aria-label="显示答案"]').exists()).toBe(true);
    useGameMode().showAnswer();
    await flushPromises();
    expect(wrapper.findComponent(Tool).find("button").exists()).toBe(false);
    useGameMode().showQuestion();
    useSummary().showSummary();
    await flushPromises();
    expect(wrapper.findComponent(Tool).find("button").exists()).toBe(false);
    useSummary().hideSummary();
    store.switchPracticeView("single");
    await flushPromises();
    expect(wrapper.findComponent(Tool).find("button").exists()).toBe(false);
    expect(wrapper.findComponent(Question).find("button").exists()).toBe(true);
  });

  async function correct(store: ReturnType<typeof useExerciseStore>) {
    store.passCurrentStatement();
    store.advanceAfterCorrect();
    await flushPromises();
  }

  it.each([
    ["progressive", "single"],
    ["progressive", "fulltext"],
    ["sentence-first", "single"],
    ["sentence-first", "fulltext"],
  ] as const)(
    "shows the button only at leaves during nested recovery in %s / %s",
    async (mode, view) => {
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
      await wrapper.get('button[aria-label="显示答案"]').trigger("click");
      expect(useAnswerTip().isAnswerTip()).toBe(true);
      await wrapper.get('button[aria-label="隐藏答案"]').trigger("click");
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
        expect(hasButton()).toBe(!canDecompose);
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
    expect(wrapper.find("button").exists()).toBe(false);
    store.failCurrentStatement();
    await flushPromises();
    expect(store.currentStatement?.unitId).toBe("unit-3");
    expect(wrapper.find("button").exists()).toBe(true);
    await correct(store);
    expect(wrapper.find("button").exists()).toBe(false);
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
    await wrapper.get('button[aria-label="显示答案"]').trigger("click");
    expect(useAnswerTip().isAnswerTip()).toBe(true);
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
    expect(wrapper.find("button").exists()).toBe(true);
    store.switchLearningMode("progressive");
    expect(store.canDecomposeCurrentUnit).toBe(false);
    store.switchLearningMode("sentence-first");
    await correct(store); // Initial leaf -> whole sentence.
    expect(wrapper.find("button").exists()).toBe(false);
    store.failCurrentStatement();
    store.failCurrentStatement();
    setActivePinia(createPinia());
    const { store: refreshed, wrapper: restored } = await setup();
    expect(refreshed.currentStatement?.unitId).toBe("unit-4");
    expect(restored.find("button").exists()).toBe(false);
    refreshed.doAgain();
    await flushPromises();
    expect(restored.find("button").exists()).toBe(false);
    refreshed.switchLearningMode("progressive");
    refreshed.doAgain();
    await flushPromises();
    expect(refreshed.currentStatement?.unitId).toBe("unit-0");
    expect(restored.find("button").exists()).toBe(true);
  });
});
