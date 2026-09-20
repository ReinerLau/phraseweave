import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Course } from "../exercise";
import type { ExerciseResponse } from "~/api/exercise";
import { getLocalExercise } from "~/services/localExerciseDb";
import { useExerciseCatalogStore } from "../exerciseCatalog";

vi.mock("~/services/localExerciseDb", () => ({
  getLocalExercise: vi.fn(),
  listLocalExercises: vi.fn(),
}));

describe("course pack store", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it("should ", async () => {
    const coursePack: ExerciseResponse = {
      id: "coursePackId",
      title: "课程包1",
      description: "这是一个课程包",
      isFree: true,
      cover: "",
      courses: [],
    };

    const firstCourse: Course = {
      id: "1",
      title: "第一课",
      order: 1,
      coursePackId: coursePack.id,
      completionCount: 0,
      statementIndex: 0,
      statements: [
        { id: "1", order: 1, english: "I", chinese: "我", soundmark: "/aɪ/" },
        { id: "2", order: 2, english: "like", chinese: "喜欢", soundmark: "/laɪk/" },
      ],
    };

    const secondCourse: Course = {
      id: "2",
      title: "第二课",
      order: 2,
      coursePackId: coursePack.id,
      completionCount: 0,
      statementIndex: 0,
      statements: [
        { id: "1", order: 1, english: "I", chinese: "我", soundmark: "/aɪ/" },
        { id: "2", order: 2, english: "like", chinese: "喜欢", soundmark: "/laɪk/" },
      ],
    };

    coursePack.courses = [firstCourse, secondCourse];

    vi.mocked(getLocalExercise).mockResolvedValue(coursePack);

    const exerciseCatalogStore = useExerciseCatalogStore();

    await exerciseCatalogStore.setupExercise(coursePack.id);

    await exerciseCatalogStore.updateExerciseCompleteCount(coursePack.id);

    expect(exerciseCatalogStore.currentExercise?.courses[0].completionCount).toBe(0);
    expect(exerciseCatalogStore.currentExercise?.courses[1].completionCount).toBe(0);
  });
});
