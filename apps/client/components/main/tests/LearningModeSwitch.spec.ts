import { createTestingPinia } from "@pinia/testing";
import { enableAutoUnmount, flushPromises, mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { courseTimer } from "~/composables/courses/courseTimer";
import { useAnswerTip } from "~/composables/main/answerTip";
import { useGameMode } from "~/composables/main/game";
import { useInput } from "~/composables/main/question";
import { useSummary } from "~/composables/main/summary";
import { useExerciseStore } from "~/store/exercise";
import LearningModeSwitch from "../LearningModeSwitch.vue";

const focusInput = vi.hoisted(() => vi.fn());
vi.mock("~/components/main/QuestionInput/questionInputHelper", () => ({
  useQuestionInput: () => ({ focusInput }),
}));
vi.mock("~/services/localExerciseDb", () => ({
  saveLocalExerciseProgress: vi.fn().mockResolvedValue(undefined),
}));

enableAutoUnmount(afterEach);

describe("LearningModeSwitch", () => {
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
      title: "练习",
      order: 1,
      coursePackId: "pack",
      completionCount: 0,
      statementIndex: 0,
      statements: legacy
        ? [{ id: "old", order: 1, english: "old" }]
        : [
            {
              id: "cat",
              order: 1,
              english: "cat",
              contextBefore: "a ",
              contextAfter: ".",
              unitId: "cat",
              sourceUnitIds: [],
            },
            {
              id: "whole",
              order: 2,
              english: "a cat",
              contextBefore: "",
              contextAfter: ".",
              unitId: "whole",
              sourceUnitIds: ["cat"],
            },
          ],
    };
    store.statementIndex = 0;
    store.currentStatement = store.currentCourse.statements[0];
    const wrapper = mount(LearningModeSwitch, { global: { plugins: [pinia] } });
    return { store, wrapper };
  }

  it("restarts the current unit and clears answer, input and its timer", async () => {
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
    await wrapper.get("select").setValue("sentence-first");
    await flushPromises();
    expect(store.learningMode).toBe("sentence-first");
    expect(store.currentStatement?.id).toBe("cat");
    expect(input.inputValue.value).toBe("");
    expect(useAnswerTip().isAnswerTip()).toBe(false);
    expect(useGameMode().isQuestion()).toBe(true);
    expect(courseTimer.totalRecordNumber()).toBe(0);
    expect(focusInput).toHaveBeenCalledOnce();
  });

  it("explains why ungrouped legacy data cannot use complex mode", () => {
    const { wrapper } = mountSwitch(true);
    expect(wrapper.get('option[value="sentence-first"]').attributes("disabled")).toBeDefined();
    expect(wrapper.text()).toContain("请重新生成");
    expect(wrapper.get("select").attributes("disabled")).toBeUndefined();
  });

  it("disables switching while the completion dialog is open", async () => {
    const { wrapper } = mountSwitch();
    useSummary().showSummary();
    await wrapper.vm.$nextTick();
    expect(wrapper.get("select").attributes("disabled")).toBeDefined();
  });

  it("keeps select keyboard events from triggering global exercise navigation", async () => {
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
