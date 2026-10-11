import { createTestingPinia } from "@pinia/testing";
import { enableAutoUnmount, mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Course, PracticeView, Statement } from "~/store/exercise";
import type { LearningMode } from "~/utils/learningDirection";
import { useAnswerTip } from "~/composables/main/answerTip";
import { useExerciseNavigation } from "~/composables/main/exerciseNavigation";
import { useGameMode } from "~/composables/main/game";
import { getLocalExercise, saveLocalExerciseProgress } from "~/services/localExerciseDb";
import { useExerciseStore } from "~/store/exercise";
import QuestionInput from "../QuestionInput.vue";

vi.mock("~/services/localExerciseDb", () => ({
  getLocalExercise: vi.fn(),
  saveLocalExercise: vi.fn().mockResolvedValue(undefined),
  saveLocalExerciseProgress: vi.fn().mockResolvedValue(undefined),
  saveLocalExerciseUnitPassed: vi.fn().mockResolvedValue(undefined),
}));

enableAutoUnmount(afterEach);

describe("submitted-answer recovery", () => {
  const sentence = "Local reports say she may have broken a test tube of pneumonic plague bacteria";
  const tailStart = sentence.indexOf("pneumonic");
  const prefix = sentence.slice(0, tailStart - 1);
  const tail = sentence.slice(tailStart);

  function row(
    id: string,
    start: number,
    end: number,
    sourceUnitIds: Statement["sourceUnitIds"],
  ): Statement {
    return {
      id,
      unitId: id,
      order: 1,
      english: sentence.slice(start, end),
      contextBefore: sentence.slice(0, start),
      contextAfter: sentence.slice(end),
      sentenceChinese: "当地报道说她可能打破了一支装有肺鼠疫细菌的试管。",
      sourceUnitIds,
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    useGameMode().showQuestion();
    useAnswerTip().hiddenAnswerTip();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    localStorage.removeItem("autoNextQuestion");
  });

  const scenarios = (["progressive", "sentence-first"] as LearningMode[]).flatMap((mode) =>
    (["single", "fulltext"] as PracticeView[]).flatMap((view) =>
      [false, true].map((autoNext) => ({ mode, view, autoNext })),
    ),
  );

  it.each(scenarios)(
    "reviews only the failed tail, then retries each parent ($mode, $view, auto-next: $autoNext)",
    async ({ mode, view, autoNext }) => {
      localStorage.setItem("autoNextQuestion", String(autoNext));
      const course: Course = {
        id: "course",
        coursePackId: "pack",
        title: "练习",
        order: 1,
        completionCount: 0,
        statementIndex: 4,
        learningMode: mode,
        practiceView: view,
        statements: [
          row("prefix", 0, tailStart - 1, []),
          row("pneumonic", tailStart, tailStart + "pneumonic".length, []),
          row("bacteria", sentence.indexOf("plague"), sentence.length, []),
          row("tail", tailStart, sentence.length, ["pneumonic", "bacteria"]),
          row("whole", 0, sentence.length, ["prefix", "tail"]),
          {
            id: "next",
            unitId: "next",
            order: 6,
            english: "Birds sing",
            contextBefore: "",
            contextAfter: ".",
            sentenceChinese: "鸟在歌唱。",
            sourceUnitIds: [],
          },
        ],
      };
      vi.mocked(getLocalExercise).mockResolvedValue({
        id: "pack",
        title: "练习",
        description: "",
        isFree: true,
        cover: "",
        courses: [course],
      });
      const pinia = createTestingPinia({ createSpy: vi.fn, stubActions: false });
      const store = useExerciseStore(pinia);
      await store.setup("pack", "course");
      const wrapper = mount(QuestionInput, { global: { plugins: [pinia] } });
      const input = wrapper.get('input[type="text"]');

      async function submit(value: string) {
        await input.setValue(value);
        await input.trigger("keydown", { code: "Enter", key: "Enter" });
      }

      await submit(prefix);
      await vi.advanceTimersByTimeAsync(300);
      expect(store.currentStatement?.unitId).toBe("tail");
      expect(store.statementIndex).toBe(4);
      expect(store.currentCourse?.passedUnitIds).toBeUndefined();
      await submit("x plague bacteria");
      await vi.advanceTimersByTimeAsync(300);
      expect(store.currentStatement?.unitId).toBe("pneumonic");
      expect(store.canDecomposeCurrentUnit).toBe(false);
      expect(saveLocalExerciseProgress).not.toHaveBeenCalled();

      for (const [answer, next] of [
        ["pneumonic", "tail"],
        [tail, "whole"],
        [sentence, "next"],
      ]) {
        await submit(answer);
        if (!autoNext) {
          expect(useGameMode().isAnswer()).toBe(true);
          useExerciseNavigation().goToNextQuestion();
        }
        await wrapper.vm.$nextTick();
        expect(store.currentStatement?.unitId).toBe(next);
        expect((input.element as HTMLInputElement).value).toBe("");
        if (next !== "next") expect(store.statementIndex).toBe(4);
      }
      expect(store.isRecovering).toBe(false);
      expect(store.statementIndex).toBe(5);
      expect(store.currentCourse?.passedUnitIds).toEqual([
        "unit:pneumonic",
        "unit:tail",
        "unit:whole",
      ]);
    },
  );
});
