import { defineStore } from "pinia";
import { computed, ref } from "vue";

import type { ExerciseCatalogItem } from "./exerciseCatalog";
import type { RecoverySources } from "./reviewRecovery";
import type { LearningMode } from "~/utils/learningDirection";
import { useActiveCourseMap } from "~/composables/courses/activeCourse";
import {
  getLocalExercise,
  saveLocalExercise,
  saveLocalExerciseProgress,
  saveLocalExerciseUnitPassed,
} from "~/services/localExerciseDb";
import { checkClozeAnswer, tokenizeClozeText } from "~/utils/clozeText";
import {
  findRecoveryOccurrence,
  groupExerciseSentences,
  sentenceFirstIndices,
} from "~/utils/learningDirection";
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
  /** Position in the original statements, independent of the selected learning direction. */
  statementIndex: number;
  passedUnitIds?: string[];
  learningMode?: LearningMode;
  /** Extra chunk occurrence inserted before its whole sentence in sentence-first mode. */
  sentenceFirstStartIndex?: number;
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
  let pendingProgressWrite = Promise.resolve();
  const { statementIndex, setupStatement } = useStatement();

  const sentenceGroups = computed(() =>
    groupExerciseSentences(currentCourse.value?.statements ?? []),
  );
  const canUseSentenceFirst = computed(() => sentenceGroups.value !== undefined);
  const learningMode = computed(() => currentCourse.value?.learningMode ?? "progressive");
  const questionIndices = computed(() => {
    const course = currentCourse.value;
    if (!course) return [];
    if (learningMode.value === "sentence-first" && sentenceGroups.value) {
      return sentenceFirstIndices(sentenceGroups.value, course.sentenceFirstStartIndex);
    }
    return course.statements.map((_, index) => index);
  });
  const baseStatements = computed(() =>
    questionIndices.value.map((index) => currentCourse.value!.statements[index]),
  );
  const questionIndex = computed(() => questionIndices.value.indexOf(statementIndex.value));

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
    return baseStatements.value.length;
  });

  function toSpecificStatement(index: number) {
    setQuestionIndex(index);
  }

  function toPreviousStatement() {
    setQuestionIndex(questionIndex.value - 1);
  }

  function toNextStatement() {
    setQuestionIndex(questionIndex.value + 1);
  }

  function resetStatementIndex() {
    setQuestionIndex(0);
  }

  function setQuestionIndex(index: number) {
    const lastIndex = Math.max(0, totalQuestionsCount.value - 1);
    const nextIndex = Number.isFinite(index)
      ? Math.min(Math.max(0, Math.trunc(index)), lastIndex)
      : 0;
    setStatementIndex(questionIndices.value[nextIndex] ?? 0);
  }

  function setStatementIndex(index: number) {
    cancelRecovery();
    statementIndex.value = index;
    refreshCurrentStatement();

    const course = currentCourse.value;
    if (!course) return;

    course.statementIndex = index;
    const state = {
      learningMode: learningMode.value,
      sentenceFirstStartIndex: course.sentenceFirstStartIndex ?? null,
    };
    pendingProgressWrite = pendingProgressWrite
      .then(() => saveLocalExerciseProgress(course.coursePackId, course.id, index, state))
      .catch((error) => console.error("保存练习进度失败", error));
  }

  function switchLearningMode(mode: LearningMode) {
    const course = currentCourse.value;
    if (
      !course ||
      mode === learningMode.value ||
      (mode === "sentence-first" && !canUseSentenceFirst.value)
    )
      return false;
    let index = statementIndex.value;
    if (recoveryUnitId.value && !isAnsweringBaseUnit.value) {
      const occurrence = findRecoveryOccurrence(course.statements, recoveryUnitId.value, index);
      if (occurrence === undefined) return false;
      index = occurrence;
    }
    course.learningMode = mode;
    course.sentenceFirstStartIndex = mode === "sentence-first" ? index : undefined;
    setStatementIndex(index);
    return true;
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
    setQuestionIndex(questionIndex.value + 1);
    return false;
  }

  function isAllDone() {
    return questionIndex.value >= totalQuestionsCount.value - 1;
  }

  function doAgain() {
    if (currentCourse.value) currentCourse.value.sentenceFirstStartIndex = undefined;
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
    await pendingProgressWrite;

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
    if (!canUseSentenceFirst.value || course.learningMode !== "sentence-first") {
      course.learningMode = "progressive";
      course.sentenceFirstStartIndex = undefined;
    } else {
      const start = course.sentenceFirstStartIndex;
      if (
        start !== undefined &&
        (!Number.isInteger(start) || start < 0 || start >= course.statements.length)
      ) {
        course.sentenceFirstStartIndex = undefined;
      }
      if (!questionIndices.value.includes(course.statementIndex)) {
        course.statementIndex =
          questionIndices.value.find((index) => index >= course.statementIndex) ??
          questionIndices.value[0];
      }
    }
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
    learningMode,
    canUseSentenceFirst,
    baseStatements,
    questionIndex,
    switchLearningMode,
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
