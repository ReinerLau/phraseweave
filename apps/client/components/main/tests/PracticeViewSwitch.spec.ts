import { createTestingPinia } from "@pinia/testing";
import { enableAutoUnmount, flushPromises, mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { courseTimer } from "~/composables/courses/courseTimer";
import { useAnswerTip } from "~/composables/main/answerTip";
import { useGameMode } from "~/composables/main/game";
import { useInput } from "~/composables/main/question";
import { useSummary } from "~/composables/main/summary";
import { useExerciseStore } from "~/store/exercise";
import PracticeViewSwitch from "../PracticeViewSwitch.vue";

const focusInput = vi.hoisted(() => vi.fn());
vi.mock("~/components/main/QuestionInput/questionInputHelper", () => ({
  useQuestionInput: () => ({ focusInput }),
}));
vi.mock("~/services/localExerciseDb", () => ({
  saveLocalExerciseProgress: vi.fn().mockResolvedValue(undefined),
}));
enableAutoUnmount(afterEach);

describe("PracticeViewSwitch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useSummary().hideSummary();
    useAnswerTip().hiddenAnswerTip();
    useGameMode().showQuestion();
    courseTimer.reset();
  });

  function mountSwitch(legacy = false) {
    const pinia = createTestingPinia({ createSpy: vi.fn, stubActions: false });
    const store = useExerciseStore(pinia);
    store.currentCourse = {
      id: "course",
      title: "文章",
      order: 1,
      coursePackId: "pack",
      completionCount: 0,
      statementIndex: 0,
      statements: [
        {
          id: "whole",
          order: 1,
          english: "cat",
          sentenceChinese: "猫。",
          contextBefore: "",
          contextAfter: ".",
          unitId: "cat",
          sourceUnitIds: [],
        },
      ],
    };
    if (legacy) store.currentCourse.statements[0].unitId = undefined;
    store.statementIndex = 0;
    store.currentStatement = store.currentCourse.statements[0];
    return { store, wrapper: mount(PracticeViewSwitch, { global: { plugins: [pinia] } }) };
  }

  it("clears input, hint, answer state and current timing, then focuses the same unit", async () => {
    const { store, wrapper } = mountSwitch();
    const input = useInput({
      source: () => "cat",
      getInputCursorPosition: () => 3,
      setInputCursorPosition: vi.fn(),
    });
    input.setInputValue("cat");
    useAnswerTip().showAnswerTip();
    useGameMode().showAnswer();
    courseTimer.time("0");
    await wrapper.get("select").setValue("fulltext");
    await flushPromises();
    expect(store.practiceView).toBe("fulltext");
    expect(store.currentStatement?.id).toBe("whole");
    expect(input.inputValue.value).toBe("");
    expect(useAnswerTip().isAnswerTip()).toBe(false);
    expect(useGameMode().isQuestion()).toBe(true);
    expect(courseTimer.totalRecordNumber()).toBe(0);
    expect(focusInput).toHaveBeenCalledOnce();
  });

  it("explains unavailable fulltext and disables switches during settlement", async () => {
    const { wrapper } = mountSwitch(true);
    expect(wrapper.get('option[value="fulltext"]').attributes("disabled")).toBeDefined();
    expect(wrapper.text()).toContain("请重新生成");
    useSummary().showSummary();
    await wrapper.vm.$nextTick();
    expect(wrapper.get("select").attributes("disabled")).toBeDefined();
  });

  it("stops select keys from reaching navigation shortcuts", async () => {
    const { wrapper } = mountSwitch();
    const listener = vi.fn();
    window.addEventListener("keydown", listener);
    try {
      await wrapper.get("select").trigger("keydown", { key: "ArrowRight" });
      expect(listener).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener("keydown", listener);
    }
  });
});
