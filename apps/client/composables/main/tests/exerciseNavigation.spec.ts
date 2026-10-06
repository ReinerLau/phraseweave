import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useExerciseStore } from "~/store/exercise";
import { useExerciseNavigation } from "../exerciseNavigation";
import { useGameMode } from "../game";

const showSummary = vi.hoisted(() => vi.fn());
const showModal = vi.hoisted(() => ({ value: false }));

vi.mock("~/composables/main/summary", () => ({
  useSummary: () => ({ showSummary, showModal }),
}));

const course = {
  id: "course",
  title: "课程",
  order: 1,
  coursePackId: "pack",
  completionCount: 0,
  statementIndex: 0,
  statements: [
    { id: "first", order: 1, english: "first", chinese: "第一题", soundmark: "/fɜːrst/" },
    { id: "second", order: 2, english: "second", chinese: "第二题", soundmark: "/ˈsekənd/" },
  ],
};

describe("exercise navigation", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    showSummary.mockClear();
    showModal.value = false;
    useGameMode().showQuestion();

    const exerciseStore = useExerciseStore();
    exerciseStore.currentCourse = course;
    exerciseStore.currentStatement = course.statements[0];
    exerciseStore.statementIndex = 0;
  });

  it("moves to the next question and shows question mode", () => {
    const exerciseStore = useExerciseStore();
    const { goToNextQuestion } = useExerciseNavigation();

    useGameMode().showAnswer();
    goToNextQuestion();

    expect(exerciseStore.statementIndex).toBe(1);
    expect(useGameMode().isQuestion()).toBe(true);
    expect(showSummary).not.toHaveBeenCalled();
  });

  it("shows the summary instead of advancing after the last question", () => {
    const exerciseStore = useExerciseStore();
    const { goToNextQuestion } = useExerciseNavigation();

    exerciseStore.statementIndex = 1;
    goToNextQuestion();

    expect(exerciseStore.statementIndex).toBe(1);
    expect(showSummary).toHaveBeenCalledOnce();
  });

  it("blocks fulltext skipping, backward navigation and forged answer state at the last question", () => {
    const store = useExerciseStore();
    store.currentCourse = { ...course, practiceView: "fulltext" };
    store.statementIndex = 1;
    store.currentStatement = course.statements[1];
    const { goToNextQuestion, goToPreviousQuestion } = useExerciseNavigation();
    goToNextQuestion();
    goToPreviousQuestion();
    expect(store.statementIndex).toBe(1);
    expect(showSummary).not.toHaveBeenCalled();
    useGameMode().showAnswer();
    goToNextQuestion();
    expect(showSummary).not.toHaveBeenCalled();
    store.passCurrentStatement();
    useGameMode().showAnswer();
    goToNextQuestion();
    expect(showSummary).toHaveBeenCalledOnce();
  });
});
