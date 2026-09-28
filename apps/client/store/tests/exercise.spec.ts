import type { Ref } from "vue";

import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";

import type { Course } from "../exercise";
import type { ExerciseCatalogItem } from "../exerciseCatalog";
import { isAuthenticated } from "~/services/auth";
import { getLocalExercise } from "~/services/localExerciseDb";
import { useExerciseStore } from "../exercise";
import { useUserStore } from "../user";

vi.mock("~/services/auth");
vi.mock("~/services/localExerciseDb", () => ({
  getLocalExercise: vi.fn(),
  saveLocalExercise: vi.fn(),
  saveLocalExerciseProgress: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../statement.ts", () => {
  return {
    useStatement: () => {
      const returnObj = {
        setupStatement(course: Ref<Course | undefined>) {
          returnObj.statementIndex.value = course.value?.statementIndex!;
        },
        statementIndex: ref(0),
      };

      return returnObj;
    },
  };
});

const firstCourse: Course = {
  id: "1",
  title: "第一课",
  order: 1,
  coursePackId: "1",
  completionCount: 0,
  statementIndex: 0,
  statements: [
    { id: "1", order: 1, english: "I", chinese: "我", soundmark: "/aɪ/" },
    { id: "2", order: 2, english: "like", chinese: "喜欢", soundmark: "/laɪk/" },
  ],
};

const coursePack: ExerciseCatalogItem = {
  id: "1",
  order: 1,
  title: "课程包1",
  description: "",
  isFree: true,
};

vi.mocked(getLocalExercise).mockResolvedValue({
  id: coursePack.id,
  title: coursePack.title,
  description: coursePack.description,
  isFree: coursePack.isFree,
  cover: "",
  courses: [firstCourse],
});

describe("course", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    firstCourse.statementIndex = 0;

    const userStore = useUserStore();
    userStore.initUser({
      userId: "cxr",
    } as any);

    vi.mocked(isAuthenticated).mockReturnValue(true);
  });

  it("initializes with a course", async () => {
    const store = useExerciseStore();

    await store.setup(coursePack.id, firstCourse.id);

    expect(store.currentCourse).toEqual(firstCourse);
    expect(store.statementIndex).toBe(0);
  });

  it("navigates to the next statement", async () => {
    const store = useExerciseStore();
    await store.setup(coursePack.id, firstCourse.id);

    store.toNextStatement();

    expect(store.statementIndex).toBe(1);
  });

  it("resets statementIndex on doAgain", async () => {
    const store = useExerciseStore();
    await store.setup(coursePack.id, firstCourse.id);
    store.toNextStatement();

    store.doAgain();

    expect(store.statementIndex).toBe(0);
  });

  it("checks if all statements are done", async () => {
    const store = useExerciseStore();
    await store.setup(coursePack.id, firstCourse.id);

    expect(store.isAllDone()).toBe(false);
    //在 firstCourse 中只有 2 个 statement
    //所以执行后 就应该是完成的状态
    store.toNextStatement();
    expect(store.isAllDone()).toBe(true);
  });

  it("checks if the answer is correct", async () => {
    const store = useExerciseStore();
    await store.setup(coursePack.id, firstCourse.id);

    expect(store.checkCorrect("I")).toBe(true);
    expect(store.checkCorrect("i")).toBe(true);
    expect(store.checkCorrect("like")).toBe(false);
  });

  it("the length of the word should be one", async () => {
    const store = useExerciseStore();
    await store.setup(coursePack.id, firstCourse.id);

    expect(store.words.length).toBe(1);
  });

  it("the count of first course question should be two", async () => {
    const store = useExerciseStore();
    await store.setup(coursePack.id, firstCourse.id);

    expect(store.totalQuestionsCount).toBe(2);
  });

  it("keeps the saved index while recovering a failed combination", async () => {
    const course: Course = {
      ...firstCourse,
      statements: [
        {
          id: "a",
          order: 1,
          english: "Researchers",
          chinese: "研究人员",
          soundmark: "",
          unitId: "0:0",
          sourceUnitIds: [],
        },
        {
          id: "b",
          order: 2,
          english: "say",
          chinese: "说",
          soundmark: "",
          unitId: "0:1",
          sourceUnitIds: [],
        },
        {
          id: "c",
          order: 3,
          english: "Researchers say",
          chinese: "研究人员说",
          soundmark: "",
          unitId: "0:2",
          sourceUnitIds: ["0:0", "0:1"],
        },
      ],
    };
    vi.mocked(getLocalExercise).mockResolvedValueOnce({
      id: coursePack.id,
      title: coursePack.title,
      description: "",
      isFree: true,
      cover: "",
      courses: [course],
    });
    const store = useExerciseStore();
    await store.setup(coursePack.id, course.id);
    store.toSpecificStatement(2);

    store.failCurrentStatement();
    expect(store.statementIndex).toBe(2);
    expect(store.currentStatement?.english).toBe("Researchers");
    expect(store.advanceAfterCorrect()).toBe(false);
    expect(store.currentStatement?.english).toBe("say");
    expect(store.advanceAfterCorrect()).toBe(false);
    expect(store.currentStatement?.english).toBe("Researchers say");
    expect(store.isAnsweringBaseUnit).toBe(true);
    expect(store.advanceAfterCorrect()).toBe(true);
    expect(store.isRecovering).toBe(false);

    store.failCurrentStatement();
    store.toPreviousStatement();
    expect(store.isRecovering).toBe(false);
    expect(store.statementIndex).toBe(1);
  });
});
