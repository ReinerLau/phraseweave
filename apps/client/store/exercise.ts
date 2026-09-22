import { defineStore } from "pinia";
import { computed, ref, watchEffect } from "vue";

import type { ExerciseCatalogItem } from "./exerciseCatalog";
import { useActiveCourseMap } from "~/composables/courses/activeCourse";
import { getLocalExercise, saveLocalExercise } from "~/services/localExerciseDb";
import { useStatement } from "./statement";

export interface Statement {
  id: string;
  order: number;
  chinese: string;
  english: string;
  soundmark: string;
}

export interface CourseIdentifier {
  coursePackId: ExerciseCatalogItem["id"];
  courseId: Course["id"];
}

export interface Course {
  id: string;
  title: string;
  order: number;
  statements: Statement[];
  coursePackId: ExerciseCatalogItem["id"];
  completionCount: number;
  statementIndex: number;
}

export const useExerciseStore = defineStore("exercise", () => {
  const currentCourse = ref<Course>();
  const currentStatement = ref<Statement>();
  const { statementIndex, setupStatement } = useStatement();

  const { updateActiveCourseMap } = useActiveCourseMap();

  watchEffect(() => {
    currentStatement.value = currentCourse.value?.statements[statementIndex.value];
  });

  const words = computed(() => {
    return currentStatement.value?.english.split(" ") || [];
  });

  const totalQuestionsCount = computed(() => {
    return currentCourse.value?.statements.length || 0;
  });

  function toSpecificStatement(index: number) {
    statementIndex.value = index;
  }

  function toPreviousStatement() {
    statementIndex.value = Math.max(0, statementIndex.value - 1);
  }

  function toNextStatement() {
    statementIndex.value = Math.min(statementIndex.value + 1, totalQuestionsCount.value - 1);
  }

  function resetStatementIndex() {
    statementIndex.value = 0;
  }

  function isAllDone() {
    return statementIndex.value >= totalQuestionsCount.value - 1;
  }

  function doAgain() {
    resetStatementIndex();
    updateActiveCourseMap(currentCourse.value?.coursePackId!, currentCourse.value?.id!);
  }

  function checkCorrect(input: string) {
    return input.toLocaleLowerCase() === currentStatement.value?.english.toLocaleLowerCase();
  }

  async function completeCourse() {
    const course = currentCourse.value;
    if (!course) return { nextCourse: undefined };

    const coursePack = await getLocalExercise(course.coursePackId);
    if (!coursePack) return { nextCourse: undefined };

    const currentIndex = coursePack.courses.findIndex((item) => item.id === course.id);
    if (currentIndex === -1) return { nextCourse: undefined };

    coursePack.courses[currentIndex].completionCount += 1;
    await saveLocalExercise(coursePack);

    return { nextCourse: coursePack.courses[currentIndex + 1] };
  }

  async function setup(coursePackId: string, courseId: string) {
    const coursePack = await getLocalExercise(coursePackId);
    const course = coursePack?.courses.find((item) => item.id === courseId);
    if (!course) throw new Error("本地找不到该练习卡片");
    currentCourse.value = course;
    setupStatement(currentCourse);
  }

  return {
    statementIndex,
    currentCourse,
    currentStatement,
    words,
    totalQuestionsCount,
    setup,
    doAgain,
    isAllDone,
    checkCorrect,
    completeCourse,
    toSpecificStatement,
    toPreviousStatement,
    toNextStatement,
    resetStatementIndex,
  };
});
