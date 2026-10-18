import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Course, PracticeView } from "../exercise";
import type { LearningMode } from "~/utils/learningDirection";
import { getLocalExercise } from "~/services/localExerciseDb";
import { useExerciseStore } from "../exercise";
import { russiaSentence, russiaStatements } from "./fixtures/russia";

// Exercise the retained alternate modes independently of the temporary production restriction.
vi.mock("~/utils/practiceModes", () => ({
  practiceModeAvailability: { progressive: true, single: true },
}));

vi.mock("~/services/localExerciseDb", () => ({
  getLocalExercise: vi.fn(),
  saveLocalExercise: vi.fn().mockResolvedValue(undefined),
  saveLocalExerciseProgress: vi.fn().mockResolvedValue(undefined),
  saveLocalExerciseUnitPassed: vi.fn().mockResolvedValue(undefined),
}));

describe("possessive error recovery", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  const scenarios = (["sentence-first", "progressive"] as LearningMode[]).flatMap((mode) =>
    (["single", "fulltext"] as PracticeView[]).map((view) => ({ mode, view })),
  );

  it.each(scenarios)(
    "starts at woman and returns to the direct source and target ($mode, $view)",
    async ({ mode, view }) => {
      const statements = russiaStatements();
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
        statements,
      };
      vi.mocked(getLocalExercise).mockResolvedValue({
        id: "pack",
        title: "练习",
        description: "",
        isFree: true,
        cover: "",
        courses: [course],
      });
      const store = useExerciseStore();
      await store.setup("pack", "course");
      store.failCurrentStatement(russiaSentence.replace("woman", "womon"));
      for (const id of ["2:2", "2:32", "2:33"]) {
        expect(store.currentStatement?.unitId).toBe(id);
        expect(store.statementIndex).toBe(anchor);
        if (id === "2:2") {
          store.failCurrentStatement("womon");
          expect(store.currentStatement?.unitId).toBe("2:2");
        }
        store.passCurrentStatement();
        store.advanceAfterCorrect();
      }
      expect(store.isRecovering).toBe(false);
    },
  );
});
