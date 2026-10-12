import { flushPromises } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Course, PracticeView } from "../exercise";
import type { LearningMode } from "~/utils/learningDirection";
import { getLocalExercise, saveLocalExerciseProgress } from "~/services/localExerciseDb";
import { useExerciseStore } from "../exercise";
import {
  deepPneumonicStatements,
  pneumonicReturnPath,
  pneumonicSentence,
} from "./fixtures/pneumonic";

vi.mock("~/services/localExerciseDb", () => ({
  getLocalExercise: vi.fn(),
  saveLocalExercise: vi.fn().mockResolvedValue(undefined),
  saveLocalExerciseProgress: vi.fn().mockResolvedValue(undefined),
  saveLocalExerciseUnitPassed: vi.fn().mockResolvedValue(undefined),
}));

describe("deep error recovery", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  async function setup(mode: LearningMode = "sentence-first", view: PracticeView = "single") {
    const statements = deepPneumonicStatements();
    const anchor = statements.length - 1;
    statements.push({
      id: "next",
      unitId: "next",
      order: statements.length + 1,
      english: "Birds sing",
      contextBefore: "",
      contextAfter: ".",
      sentenceChinese: "鸟在歌唱。",
      sourceUnitIds: [],
    });
    const course: Course = {
      id: "course",
      coursePackId: "pack",
      title: "练习",
      order: 1,
      completionCount: 0,
      statementIndex: anchor,
      statements,
      learningMode: mode,
      practiceView: view,
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
    return { store, anchor };
  }

  function correct(store: ReturnType<typeof useExerciseStore>) {
    store.passCurrentStatement();
    return store.advanceAfterCorrect();
  }

  const scenarios = (["sentence-first", "progressive"] as LearningMode[]).flatMap((mode) =>
    (["single", "fulltext"] as PracticeView[]).map((view) => ({ mode, view })),
  );

  it.each(scenarios)(
    "descends eleven levels but only retries the direct source and target ($mode, $view)",
    async ({ mode, view }) => {
      const { store, anchor } = await setup(mode, view);
      store.failCurrentStatement(pneumonicSentence.replace("pneumonic", "x"));
      expect(store.currentStatement?.unitId).toBe("0:3");
      expect(store.currentCourse?.passedUnitIds).toBeUndefined();
      store.failCurrentStatement("x");
      expect(store.currentStatement?.unitId).toBe("0:3");
      expect(pneumonicReturnPath).toHaveLength(11);
      for (const id of ["0:28", "0:29"]) {
        correct(store);
        expect(store.currentStatement?.unitId).toBe(id);
        expect(store.statementIndex).toBe(anchor);
      }
      await flushPromises();
      expect(saveLocalExerciseProgress).not.toHaveBeenCalled();
      correct(store);
      expect(store.currentStatement?.unitId).toBe("next");
      expect(store.isRecovering).toBe(false);
    },
  );

  it("resumes the failed intermediate combination after a different word fails", async () => {
    const { store } = await setup();
    store.failCurrentStatement(pneumonicSentence.replace("pneumonic", "x"));
    correct(store);
    expect(store.currentStatement?.unitId).toBe("0:28");
    store.failCurrentStatement(store.currentStatement!.english.replace("plague", "x"));
    expect(store.currentStatement?.unitId).toBe("0:4");
    correct(store);
    expect(store.currentStatement?.unitId).toBe("0:25");
    store.failCurrentStatement(store.currentStatement!.english.replace("bacteria", "x"));
    expect(store.currentStatement?.unitId).toBe("0:5");
    for (const id of ["0:24", "0:25", "0:28", "0:29"]) {
      correct(store);
      expect(store.currentStatement?.unitId).toBe(id);
    }
    correct(store);
    expect(store.currentStatement?.unitId).toBe("next");
    expect(store.isRecovering).toBe(false);
  });

  it("replaces the root review sequence when its retry fails at another word", async () => {
    const { store } = await setup();
    store.failCurrentStatement(pneumonicSentence.replace("pneumonic", "x"));
    correct(store);
    correct(store);
    store.failCurrentStatement(pneumonicSentence.replace("plague", "x"));
    expect(store.currentStatement?.unitId).toBe("0:4");
    correct(store);
    expect(store.currentStatement?.unitId).toBe("0:28");
    correct(store);
    expect(store.currentStatement?.unitId).toBe("0:29");
    correct(store);
    expect(store.currentStatement?.unitId).toBe("next");
  });

  it("reviews only the current unfilled word before its direct source and target", async () => {
    const { store } = await setup();
    store.failCurrentStatement(pneumonicSentence.slice(0, pneumonicSentence.indexOf("pneumonic")));
    for (const id of ["0:3", "0:28", "0:29"]) {
      expect(store.currentStatement?.unitId).toBe(id);
      correct(store);
    }
    expect(store.currentStatement?.unitId).toBe("next");
  });

  it("keeps a correct prefix on the base question without starting recovery", async () => {
    const { store, anchor } = await setup();
    store.failCurrentStatement(
      pneumonicSentence.slice(0, pneumonicSentence.indexOf("pneumonic")).trimEnd(),
    );
    expect(store.currentStatement?.unitId).toBe("0:29");
    expect(store.statementIndex).toBe(anchor);
    expect(store.isRecovering).toBe(false);
    expect(store.currentCourse?.passedUnitIds).toBeUndefined();
    expect(store.advanceAfterCorrect()).toBe(false);
  });

  it("restores only the base question on reload", async () => {
    const { store, anchor } = await setup();
    store.failCurrentStatement(pneumonicSentence.replace("pneumonic", "x"));
    setActivePinia(createPinia());
    const refreshed = useExerciseStore();
    await refreshed.setup("pack", "course");
    expect(refreshed.statementIndex).toBe(anchor);
    expect(refreshed.currentStatement?.unitId).toBe("0:29");
    expect(refreshed.isRecovering).toBe(false);
  });
});
