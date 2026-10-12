import { createTestingPinia } from "@pinia/testing";
import { enableAutoUnmount, mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Course, PracticeView } from "~/store/exercise";
import type { LearningMode } from "~/utils/learningDirection";
import { useAnswerTip } from "~/composables/main/answerTip";
import { useExerciseNavigation } from "~/composables/main/exerciseNavigation";
import { useGameMode } from "~/composables/main/game";
import { getLocalExercise, saveLocalExerciseProgress } from "~/services/localExerciseDb";
import { useExerciseStore } from "~/store/exercise";
import {
  deepPneumonicStatements,
  pneumonicReturnPath,
  pneumonicSentence,
} from "~/store/tests/fixtures/pneumonic";
import QuestionInput from "../QuestionInput.vue";

vi.mock("~/services/localExerciseDb", () => ({
  getLocalExercise: vi.fn(),
  saveLocalExercise: vi.fn().mockResolvedValue(undefined),
  saveLocalExerciseProgress: vi.fn().mockResolvedValue(undefined),
  saveLocalExerciseUnitPassed: vi.fn().mockResolvedValue(undefined),
}));

enableAutoUnmount(afterEach);

describe("submitted-answer recovery", () => {
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
    "descends directly and resumes every parent after a nested failure ($mode, $view, auto-next: $autoNext)",
    async ({ mode, view, autoNext }) => {
      localStorage.setItem("autoNextQuestion", String(autoNext));
      const statements = deepPneumonicStatements();
      const anchor = statements.length - 1;
      const course: Course = {
        id: "course",
        coursePackId: "pack",
        title: "练习",
        order: 1,
        completionCount: 0,
        statementIndex: anchor,
        learningMode: mode,
        practiceView: view,
        statements: [
          ...statements,
          {
            id: "next",
            unitId: "next",
            order: statements.length + 1,
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

      await submit(pneumonicSentence.replace("pneumonic", "x"));
      await vi.advanceTimersByTimeAsync(300);
      expect(store.currentStatement?.unitId).toBe("0:3");
      expect(store.statementIndex).toBe(anchor);
      expect(store.currentCourse?.passedUnitIds).toBeUndefined();
      expect(store.canDecomposeCurrentUnit).toBe(false);
      expect(saveLocalExerciseProgress).not.toHaveBeenCalled();

      async function submitCorrect(answer: string, next: string) {
        await submit(answer);
        if (!autoNext) {
          expect(useGameMode().isAnswer()).toBe(true);
          useExerciseNavigation().goToNextQuestion();
        }
        await wrapper.vm.$nextTick();
        expect(store.currentStatement?.unitId).toBe(next);
        expect((input.element as HTMLInputElement).value).toBe("");
        if (next !== "next") expect(store.statementIndex).toBe(anchor);
      }
      await submitCorrect("pneumonic", "0:7");
      await submit("pneumonic x bacteria");
      await vi.advanceTimersByTimeAsync(300);
      expect(store.currentStatement?.unitId).toBe("0:4");
      await submitCorrect("plague", "0:6");
      await submitCorrect("plague bacteria", "0:7");
      for (const [index, [, english]] of pneumonicReturnPath.entries()) {
        await submitCorrect(english, pneumonicReturnPath[index + 1]?.[0] ?? "next");
      }
      expect(store.isRecovering).toBe(false);
      expect(store.statementIndex).toBe(anchor + 1);
      expect(store.currentCourse?.passedUnitIds).toEqual([
        "unit:0:3",
        "unit:0:4",
        "unit:0:6",
        ...pneumonicReturnPath.map(([id]) => `unit:${id}`),
      ]);
    },
  );
});
