import { createTestingPinia } from "@pinia/testing";
import { enableAutoUnmount, mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Course, PracticeView } from "~/store/exercise";
import type { LearningMode } from "~/utils/learningDirection";
import { useAnswerTip } from "~/composables/main/answerTip";
import { useExerciseNavigation } from "~/composables/main/exerciseNavigation";
import { useGameMode } from "~/composables/main/game";
import { useSummary } from "~/composables/main/summary";
import { getLocalExercise, saveLocalExerciseProgress } from "~/services/localExerciseDb";
import { useExerciseStore } from "~/store/exercise";
import { deepPneumonicStatements } from "~/store/tests/fixtures/pneumonic";
import { getClozeWords } from "~/utils/clozeText";
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

vi.mock("~/services/localExerciseDb", () => ({
  getLocalExercise: vi.fn(),
  saveLocalExercise: vi.fn().mockResolvedValue(undefined),
  saveLocalExerciseProgress: vi.fn().mockResolvedValue(undefined),
  saveLocalExerciseUnitPassed: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../useCorrectSound", () => ({ useCorrectSound: () => ({ playCorrectSound: vi.fn() }) }));

enableAutoUnmount(afterEach);

describe("word space checking recovery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.setItem("wordSpaceCheck", "true");
    localStorage.setItem("keyboardSoundEnabled", "false");
    useGameMode().showQuestion();
    useAnswerTip().hiddenAnswerTip();
    useSummary().hideSummary();
  });

  afterEach(() => {
    useSummary().hideSummary();
    for (const key of ["wordSpaceCheck", "keyboardSoundEnabled", "autoNextQuestion"]) {
      localStorage.removeItem(key);
    }
  });

  const scenarios = (["progressive", "sentence-first"] as LearningMode[]).flatMap((mode) =>
    (["single", "fulltext"] as PracticeView[]).flatMap((view) =>
      [false, true].map((autoNext) => ({ mode, view, autoNext })),
    ),
  );

  it.each(scenarios)(
    "recovers only the requested word and resumes nested practice ($mode, $view, auto-next: $autoNext)",
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
      const input = wrapper.get("input");

      async function confirmWord(word: string, code = "Enter") {
        await input.setValue(word);
        await input.trigger("keydown", { code, key: code === "Space" ? " " : "Enter" });
      }

      async function askForWord(word: string, draft = "") {
        const words = getClozeWords(store.currentStatement!.english);
        for (const prefix of words.slice(0, words.indexOf(word)))
          await confirmWord(prefix, "Space");
        await input.setValue(draft);
        await input.trigger("keydown", { code: "Enter", key: "Enter" });
      }

      async function completeUnit(nextId: string) {
        for (const word of getClozeWords(store.currentStatement!.english)) await confirmWord(word);
        if (!autoNext) {
          expect(useGameMode().isAnswer()).toBe(true);
          useExerciseNavigation().goToNextQuestion();
        }
        await wrapper.vm.$nextTick();
        expect(store.currentStatement?.unitId).toBe(nextId);
        expect((input.element as HTMLInputElement).value).toBe("");
        if (nextId !== "next") expect(store.statementIndex).toBe(anchor);
      }

      await askForWord("pneumonic");
      expect(store.currentStatement?.unitId).toBe("0:3");
      expect(store.statementIndex).toBe(anchor);
      expect(store.currentCourse?.passedUnitIds).toBeUndefined();
      expect(saveLocalExerciseProgress).not.toHaveBeenCalled();
      await completeUnit("0:28");
      await askForWord("plague", "plagu");
      expect(store.currentStatement?.unitId).toBe("0:4");
      await completeUnit("0:25");
      await completeUnit("0:28");
      await completeUnit("0:29");
      await completeUnit("next");
      expect(store.isRecovering).toBe(false);
      expect(store.currentCourse?.passedUnitIds).toEqual([
        "unit:0:3",
        "unit:0:4",
        "unit:0:25",
        "unit:0:28",
        "unit:0:29",
      ]);
      for (const word of ["Birds", "sing"]) await confirmWord(word);
      if (!autoNext) useExerciseNavigation().goToNextQuestion();
      expect(useSummary().showModal.value).toBe(true);
      expect(store.currentCourse?.resumeStatementIndex).toBeNull();
    },
  );
});
