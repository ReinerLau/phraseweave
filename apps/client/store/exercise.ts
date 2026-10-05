import { defineStore } from "pinia";
import { computed, ref } from "vue";

import type { ExerciseCatalogItem } from "./exerciseCatalog";
import type { RecoverySources } from "./reviewRecovery";
import { useActiveCourseMap } from "~/composables/courses/activeCourse";
import {
  getLocalExercise,
  saveLocalExercise,
  saveLocalExerciseProgress,
  saveLocalExerciseUnitPassed,
} from "~/services/localExerciseDb";
import { checkClozeAnswer, tokenizeClozeText } from "~/utils/clozeText";
import { ReviewRecovery } from "./reviewRecovery";
import { useStatement } from "./statement";

export interface Statement {
  id: string;
  order: number;
  chinese?: string;
  english: string;
  soundmark?: string;
  contextBefore?: string;
  contextAfter?: string;
  sentenceChinese?: string;
  unitId?: string;
  sourceUnitIds?: [] | RecoverySources;
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
  passedUnitIds?: string[];
}

function unitPassKey(statement: Statement) {
  return statement.unitId ? `unit:${statement.unitId}` : `statement:${statement.id}`;
}

export const useExerciseStore = defineStore("exercise", () => {
  const currentCourse = ref<Course>();
  const currentStatement = ref<Statement>();
  const recoveryUnitId = ref<string>();
  const isRecovering = computed(() => recoveryUnitId.value !== undefined);
  const isAnsweringBaseUnit = computed(
    () =>
      recoveryUnitId.value === undefined ||
      recoveryUnitId.value === currentCourse.value?.statements[statementIndex.value]?.unitId,
  );
  const unitStatements = new Map<string, Statement>();
  let recovery: ReviewRecovery | undefined;
  let pendingPassedWrite = Promise.resolve();
  const { statementIndex, setupStatement } = useStatement();

  const { updateActiveCourseMap } = useActiveCourseMap();

  function refreshCurrentStatement() {
    currentStatement.value = recoveryUnitId.value
      ? unitStatements.get(recoveryUnitId.value)
      : currentCourse.value?.statements[statementIndex.value];
  }

  const clozeTokens = computed(() => tokenizeClozeText(currentStatement.value?.english ?? ""));
  const words = computed(() =>
    clozeTokens.value.filter((token) => token.kind === "word").map((token) => token.text),
  );

  const totalQuestionsCount = computed(() => {
    return currentCourse.value?.statements.length || 0;
  });

  function toSpecificStatement(index: number) {
    setStatementIndex(index);
  }

  function toPreviousStatement() {
    setStatementIndex(statementIndex.value - 1);
  }

  function toNextStatement() {
    setStatementIndex(statementIndex.value + 1);
  }

  function resetStatementIndex() {
    setStatementIndex(0);
  }

  function setStatementIndex(index: number) {
    cancelRecovery();
    const lastIndex = Math.max(0, totalQuestionsCount.value - 1);
    const nextIndex = Number.isFinite(index)
      ? Math.min(Math.max(0, Math.trunc(index)), lastIndex)
      : 0;
    statementIndex.value = nextIndex;
    refreshCurrentStatement();

    const course = currentCourse.value;
    if (!course) return;

    course.statementIndex = nextIndex;
    void saveLocalExerciseProgress(course.coursePackId, course.id, nextIndex).catch((error) => {
      console.error("保存练习进度失败", error);
    });
  }

  function cancelRecovery() {
    recovery?.cancel();
    recoveryUnitId.value = undefined;
    refreshCurrentStatement();
  }

  function failCurrentStatement() {
    recoveryUnitId.value = recovery?.fail(currentStatement.value?.unitId);
    refreshCurrentStatement();
  }

  /** Returns true only after the final base question has been answered. */
  function advanceAfterCorrect(): boolean {
    recoveryUnitId.value = recovery?.correct();
    if (recoveryUnitId.value) {
      refreshCurrentStatement();
      return false;
    }
    refreshCurrentStatement();
    if (isAllDone()) return true;
    setStatementIndex(statementIndex.value + 1);
    return false;
  }

  function isAllDone() {
    return statementIndex.value >= totalQuestionsCount.value - 1;
  }

  function doAgain() {
    resetStatementIndex();
    updateActiveCourseMap(currentCourse.value?.coursePackId!, currentCourse.value?.id!);
  }

  function checkCorrect(input: string) {
    const statement = currentStatement.value;
    return statement !== undefined && checkClozeAnswer(statement.english, input);
  }

  function isStatementPassed(statement: Statement) {
    return currentCourse.value?.passedUnitIds?.includes(unitPassKey(statement)) ?? false;
  }

  function passCurrentStatement() {
    const course = currentCourse.value;
    const statement = currentStatement.value;
    if (!course || !statement) return;

    const key = unitPassKey(statement);
    if (isStatementPassed(statement)) return;
    course.passedUnitIds = [...(course.passedUnitIds ?? []), key];
    pendingPassedWrite = pendingPassedWrite
      .then(() => saveLocalExerciseUnitPassed(course.coursePackId, course.id, key))
      .catch((error) => {
        console.error("保存单元通过记录失败", error);
      });
  }

  async function completeCourse() {
    const course = currentCourse.value;
    if (!course) return { nextCourse: undefined };

    await pendingPassedWrite;

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

    const lastIndex = Math.max(0, course.statements.length - 1);
    course.statementIndex = Number.isFinite(course.statementIndex)
      ? Math.min(Math.max(0, Math.trunc(course.statementIndex)), lastIndex)
      : 0;
    currentCourse.value = course;
    unitStatements.clear();
    const firstUnitOrder = new Map<string, number>();
    const sourcesByUnitId = new Map<string, RecoverySources>();
    for (const [index, statement] of course.statements.entries()) {
      if (!statement.unitId || unitStatements.has(statement.unitId)) continue;
      unitStatements.set(statement.unitId, statement);
      firstUnitOrder.set(statement.unitId, index);
    }
    for (const statement of unitStatements.values()) {
      const sourceUnitIds = statement.sourceUnitIds;
      if (
        statement.unitId &&
        sourceUnitIds &&
        sourceUnitIds.length !== 0 &&
        sourceUnitIds.every(
          (id) => (firstUnitOrder.get(id) ?? Infinity) < firstUnitOrder.get(statement.unitId!)!,
        )
      )
        sourcesByUnitId.set(statement.unitId, sourceUnitIds);
    }
    recovery = new ReviewRecovery(sourcesByUnitId);
    recoveryUnitId.value = undefined;
    setupStatement(currentCourse);
    refreshCurrentStatement();
  }

  return {
    statementIndex,
    currentCourse,
    currentStatement,
    isRecovering,
    isAnsweringBaseUnit,
    words,
    clozeTokens,
    totalQuestionsCount,
    setup,
    doAgain,
    isAllDone,
    checkCorrect,
    isStatementPassed,
    passCurrentStatement,
    failCurrentStatement,
    advanceAfterCorrect,
    cancelRecovery,
    completeCourse,
    toSpecificStatement,
    toPreviousStatement,
    toNextStatement,
    resetStatementIndex,
  };
});
