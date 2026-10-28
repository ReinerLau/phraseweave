import { defineStore } from "pinia";
import { computed, ref, shallowRef } from "vue";

import type { ExerciseCatalogItem } from "./exerciseCatalog";
import type { RecoverySources } from "./reviewRecovery";
import type { LearningMode } from "~/utils/learningDirection";
import { useActiveCourseMap } from "~/composables/courses/activeCourse";
import { translatePracticeStep } from "~/services/generatorClient";
import {
  getLocalExercise,
  saveLocalExercise,
  saveLocalExerciseProgress,
  saveLocalExerciseTranslation,
  saveLocalExerciseUnitPassed,
} from "~/services/localExerciseDb";
import { checkClozeAnswer, tokenizeClozeText } from "~/utils/clozeText";
import {
  findRecoveryOccurrence,
  groupExerciseSentences,
  sentenceFirstIndices,
} from "~/utils/learningDirection";
import { practiceModeAvailability } from "~/utils/practiceModes";
import { practiceSpans } from "~/utils/practiceSpans";
import { buildRecoverySteps } from "~/utils/recoverySources";
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
  stepTranslations?: Record<string, string>;
  /** Generation-time UTF-16 ranges for opt-in clause practice. */
  practiceSpans?: Array<[number, number]>;
  unitId?: string;
  sourceUnitIds?: [] | RecoverySources;
}

export interface CourseIdentifier {
  coursePackId: ExerciseCatalogItem["id"];
  courseId: Course["id"];
}

export type PracticeView = "single" | "fulltext";

export interface Course {
  id: string;
  title: string;
  order: number;
  statements: Statement[];
  coursePackId: ExerciseCatalogItem["id"];
  completionCount: number;
  /** Identifies the generated step sequence and its translation timing. */
  practiceSequence?: "comma-segments-v1" | "lazy-comma-segments-v1" | "lazy-clause-segments-v1";
  /** Position in the original statements, independent of the selected learning direction. */
  statementIndex: number;
  /** Unfinished base question in the original statements; null after completing a run. */
  resumeStatementIndex?: number | null;
  resumeStepIndex?: number;
  passedUnitIds?: string[];
  learningMode?: LearningMode;
  practiceView?: PracticeView;
  /** Extra chunk occurrence inserted before its whole sentence in sentence-first mode. */
  sentenceFirstStartIndex?: number;
}

function unitPassKey(statement: Statement) {
  return statement.unitId ? `unit:${statement.unitId}` : `statement:${statement.id}`;
}

function hasFinishedFirstPass(course: Course) {
  return (
    course.completionCount > 0 ||
    course.resumeStatementIndex === null ||
    course.learningMode === "sentence-first"
  );
}

export const useExerciseStore = defineStore("exercise", () => {
  const currentCourse = ref<Course>();
  const currentStatement = ref<Statement>();
  const recoveryUnitId = ref<string>();
  const currentAnswerAccepted = ref(false);
  const lazyStepIndex = ref(0);
  const lazyReviewMode = ref(false);
  const translationLoading = ref(false);
  const translationError = ref("");
  const fetchedTranslations = new Map<string, string>();
  const pendingTranslations = new Map<string, Promise<string>>();
  let translationRequest = 0;
  const fulltextCompleted = ref(false);
  const isRecovering = computed(() => recoveryUnitId.value !== undefined);
  const isAnsweringBaseUnit = computed(
    () =>
      recoveryUnitId.value === undefined ||
      recoveryUnitId.value === currentCourse.value?.statements[statementIndex.value]?.unitId,
  );
  const unitStatements = new Map<string, Statement>();
  const sourcesByUnitId = new Map<string, RecoverySources>();
  const recovery = shallowRef<ReviewRecovery>();
  const canDecomposeCurrentUnit = computed(
    () => recovery.value?.canDecompose(currentStatement.value?.unitId) ?? false,
  );
  let pendingPassedWrite = Promise.resolve();
  let pendingProgressWrite = Promise.resolve();
  const { statementIndex, setupStatement } = useStatement();
  const isLazy = computed(() =>
    currentCourse.value?.practiceSequence === "lazy-comma-segments-v1" ||
    currentCourse.value?.practiceSequence === "lazy-clause-segments-v1",
  );
  const translationReady = computed(
    () => !isLazy.value || Boolean(currentStatement.value?.sentenceChinese?.trim()),
  );
  function lazySpans(index = statementIndex.value) {
    const statement = currentCourse.value?.statements[index];
    return statement?.practiceSpans ?? practiceSpans(statement?.english ?? "");
  }
  function lazyReview() {
    return lazyReviewMode.value;
  }

  const sentenceGroups = computed(() =>
    groupExerciseSentences(currentCourse.value?.statements ?? []),
  );
  const canUseSentenceFirst = computed(() => sentenceGroups.value !== undefined);
  const sentences = computed(() =>
    (sentenceGroups.value ?? []).map((group) => {
      const whole = currentCourse.value!.statements[group.end];
      return {
        ...group,
        id: whole.id,
        english: whole.contextBefore! + whole.english + whole.contextAfter!,
        chinese: whole.sentenceChinese ?? "",
      };
    }),
  );
  const canUseFulltext = computed(
    () =>
      canUseSentenceFirst.value &&
      (isLazy.value || sentences.value.every((sentence) => sentence.chinese.trim())),
  );
  const practiceView = computed(
    () =>
      currentCourse.value?.practiceView ??
      (practiceModeAvailability.single ? "single" : "fulltext"),
  );
  const isFulltext = computed(() => practiceView.value === "fulltext");
  const currentSentenceIndex = computed(() =>
    sentences.value.findIndex(
      (sentence) => statementIndex.value >= sentence.start && statementIndex.value <= sentence.end,
    ),
  );
  const precedingSentences = computed(() => sentences.value.slice(0, currentSentenceIndex.value));
  const learningMode = computed(
    () =>
      currentCourse.value?.learningMode ??
      (practiceModeAvailability.progressive ? "progressive" : "sentence-first"),
  );
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
  const resumeQuestionIndex = computed(() => {
    const index = currentCourse.value?.resumeStatementIndex;
    return index === null ? -1 : questionIndices.value.indexOf(index ?? statementIndex.value);
  });

  function normalizeResumeStatementIndex(fallback: number) {
    const course = currentCourse.value;
    if (!course || course.resumeStatementIndex === null) return;
    const index = course.resumeStatementIndex;
    course.resumeStatementIndex =
      index !== undefined &&
      Number.isInteger(index) &&
      index >= 0 &&
      index < course.statements.length
        ? questionIndices.value.find((candidate) => candidate >= index) ?? fallback
        : fallback;
  }

  const { updateActiveCourseMap } = useActiveCourseMap();

  function refreshCurrentStatement() {
    if (isLazy.value) {
      const base = currentCourse.value?.statements[statementIndex.value];
      if (!base) {
        currentStatement.value = undefined;
        return;
      }
      const spans = lazySpans();
      lazyStepIndex.value = Math.min(Math.max(0, lazyStepIndex.value), spans.length - 1);
      const [start, end] = spans[lazyStepIndex.value];
      currentStatement.value = {
        ...base,
        id: `${base.id}:step:${lazyStepIndex.value}`,
        english: base.english.slice(start, end),
        contextBefore: base.english.slice(0, start),
        contextAfter: base.english.slice(end),
        sentenceChinese: base.stepTranslations?.[lazyStepIndex.value] ?? "",
      };
      return;
    }
    currentStatement.value = recoveryUnitId.value
      ? unitStatements.get(recoveryUnitId.value)
      : currentCourse.value?.statements[statementIndex.value];
  }

  const originalSentence = computed(() => {
    const statement = currentStatement.value;
    if (!statement) return "";
    return (statement.contextBefore ?? "") + statement.english + (statement.contextAfter ?? "");
  });
  const isCommaSegmentQuestion = computed(() => {
    if (isLazy.value) return lazyStepIndex.value < lazySpans().length - 1;
    const course = currentCourse.value;
    const group = sentenceGroups.value?.[currentSentenceIndex.value];
    return (
      course?.practiceSequence === "comma-segments-v1" &&
      group !== undefined &&
      currentStatement.value !== undefined &&
      currentStatement.value?.id !== course.statements[group.end].id
    );
  });
  const currentPracticeText = computed(() =>
    isCommaSegmentQuestion.value ? currentStatement.value?.english ?? "" : originalSentence.value,
  );

  const clozeTokens = computed(() => tokenizeClozeText(currentStatement.value?.english ?? ""));
  const words = computed(() =>
    clozeTokens.value.filter((token) => token.kind === "word").map((token) => token.text),
  );

  const totalQuestionsCount = computed(() => {
    return baseStatements.value.length;
  });

  function canJumpToStatement(index: number) {
    const statement = baseStatements.value[index];
    return (
      translationReady.value &&
      Number.isInteger(index) &&
      statement !== undefined &&
      index !== questionIndex.value &&
      (!isFulltext.value || isStatementPassed(statement) || index === resumeQuestionIndex.value)
    );
  }

  function toSpecificStatement(index: number) {
    if (!translationReady.value) return false;
    if (isFulltext.value && !canJumpToStatement(index)) return false;
    setQuestionIndex(index, !isFulltext.value);
    return true;
  }

  function toPreviousStatement() {
    if (isFulltext.value || !translationReady.value) return;
    setQuestionIndex(questionIndex.value - 1, true);
  }

  function toNextStatement() {
    if (isFulltext.value || !translationReady.value) return;
    setQuestionIndex(questionIndex.value + 1, true);
  }

  function resetStatementIndex() {
    if (isFulltext.value || !translationReady.value) return;
    setQuestionIndex(0, true);
  }

  function setQuestionIndex(index: number, updateResume = false) {
    const lastIndex = Math.max(0, totalQuestionsCount.value - 1);
    const nextIndex = Number.isFinite(index)
      ? Math.min(Math.max(0, Math.trunc(index)), lastIndex)
      : 0;
    const originalIndex = questionIndices.value[nextIndex] ?? 0;
    if (updateResume && currentCourse.value)
      currentCourse.value.resumeStatementIndex = originalIndex;
    setStatementIndex(originalIndex);
  }

  function setStatementIndex(index: number) {
    normalizeResumeStatementIndex(statementIndex.value);
    cancelRecovery();
    fulltextCompleted.value = false;
    statementIndex.value = index;
    if (isLazy.value) {
      const course = currentCourse.value!;
      lazyStepIndex.value =
        lazyReview() || index !== course.resumeStatementIndex
          ? lazySpans(index).length - 1
          : Math.min(course.resumeStepIndex ?? 0, lazySpans(index).length - 1);
    }
    refreshCurrentStatement();

    const course = currentCourse.value;
    if (!course) return;

    course.statementIndex = index;
    persistProgress();
    if (isLazy.value) void ensureCurrentTranslation();
  }

  function persistProgress() {
    const course = currentCourse.value;
    if (!course) return;
    normalizeResumeStatementIndex(statementIndex.value);
    const index = statementIndex.value;
    const state = {
      learningMode: learningMode.value,
      sentenceFirstStartIndex: course.sentenceFirstStartIndex ?? null,
      practiceView: practiceView.value,
      resumeStatementIndex: course.resumeStatementIndex ?? null,
      ...(isLazy.value ? { resumeStepIndex: course.resumeStepIndex ?? 0 } : {}),
    };
    pendingProgressWrite = pendingProgressWrite
      .then(() => saveLocalExerciseProgress(course.coursePackId, course.id, index, state))
      .catch((error) => console.error("保存练习进度失败", error));
  }

  function switchPracticeView(view: PracticeView) {
    const course = currentCourse.value;
    if (view === "single" && !practiceModeAvailability.single) return false;
    if (!course || view === practiceView.value || (view === "fulltext" && !canUseFulltext.value))
      return false;
    course.practiceView = view;
    currentAnswerAccepted.value = false;
    fulltextCompleted.value = false;
    persistProgress();
    return true;
  }

  function switchLearningMode(mode: LearningMode) {
    const course = currentCourse.value;
    if (mode === "progressive" && !practiceModeAvailability.progressive) return false;
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
    normalizeResumeStatementIndex(statementIndex.value);
    course.learningMode = mode;
    course.sentenceFirstStartIndex = mode === "sentence-first" ? index : undefined;
    normalizeResumeStatementIndex(index);
    setStatementIndex(index);
    return true;
  }

  function cancelRecovery() {
    currentAnswerAccepted.value = false;
    recovery.value?.cancel();
    recoveryUnitId.value = undefined;
    refreshCurrentStatement();
  }

  function failCurrentStatement(input?: string, lastWordIndex?: number) {
    currentAnswerAccepted.value = false;
    const statement = currentStatement.value;
    const steps = statement
      ? buildRecoverySteps(statement, input, unitStatements, sourcesByUnitId, lastWordIndex)
      : undefined;
    if (steps?.length === 0) return;
    recoveryUnitId.value = recovery.value?.fail(statement?.unitId, steps);
    refreshCurrentStatement();
  }

  /** Returns true only after the final base question has been answered. */
  function advanceAfterCorrect(): boolean {
    if (!translationReady.value) return false;
    // Historic unit passes and an answer panel cannot unlock the next fulltext question.
    if (isFulltext.value && (!currentAnswerAccepted.value || fulltextCompleted.value)) return false;
    currentAnswerAccepted.value = false;
    if (isLazy.value && lazyStepIndex.value < lazySpans().length - 1) {
      lazyStepIndex.value++;
      if (currentCourse.value!.resumeStatementIndex === statementIndex.value)
        currentCourse.value!.resumeStepIndex = lazyStepIndex.value;
      refreshCurrentStatement();
      persistProgress();
      void ensureCurrentTranslation();
      return false;
    }
    recoveryUnitId.value = recovery.value?.correct();
    if (recoveryUnitId.value) {
      refreshCurrentStatement();
      return false;
    }
    refreshCurrentStatement();
    const course = currentCourse.value;
    normalizeResumeStatementIndex(statementIndex.value);
    if (questionIndex.value >= totalQuestionsCount.value - 1) {
      fulltextCompleted.value = isFulltext.value;
      if (isLazy.value) lazyReviewMode.value = true;
      if (course) {
        course.resumeStatementIndex = null;
        persistProgress();
      }
      return true;
    }
    if (course?.resumeStatementIndex === statementIndex.value) {
      course.resumeStatementIndex = questionIndices.value[questionIndex.value + 1];
      if (isLazy.value) course.resumeStepIndex = 0;
    }
    setQuestionIndex(questionIndex.value + 1);
    return false;
  }

  function isAllDone() {
    if (isFulltext.value) return fulltextCompleted.value;
    return questionIndex.value >= totalQuestionsCount.value - 1;
  }

  function doAgain() {
    if (currentCourse.value) {
      const course = currentCourse.value;
      course.sentenceFirstStartIndex = undefined;
      if (course.practiceSequence === "comma-segments-v1") {
        course.learningMode = hasFinishedFirstPass(course) ? "sentence-first" : "progressive";
      }
      if (isLazy.value) course.learningMode = "sentence-first";
      if (isLazy.value && !lazyReview()) course.resumeStepIndex = 0;
    }
    setQuestionIndex(0, true);
    updateActiveCourseMap(currentCourse.value?.coursePackId!, currentCourse.value?.id!);
  }

  function checkCorrect(input: string) {
    const statement = currentStatement.value;
    return (
      translationReady.value &&
      statement !== undefined &&
      checkClozeAnswer(statement.english, input)
    );
  }

  function isStatementPassed(statement: Statement) {
    return currentCourse.value?.passedUnitIds?.includes(unitPassKey(statement)) ?? false;
  }

  function passCurrentStatement() {
    const course = currentCourse.value;
    const statement = currentStatement.value;
    if (!course || !statement || !translationReady.value) return;

    currentAnswerAccepted.value = true;

    if (isLazy.value && isCommaSegmentQuestion.value) return;

    const key = unitPassKey(isLazy.value ? course.statements[statementIndex.value] : statement);
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
    if (isFulltext.value && !fulltextCompleted.value) return { nextCourse: undefined };

    if (course.resumeStatementIndex !== null) {
      course.resumeStatementIndex = null;
      persistProgress();
    }

    await pendingPassedWrite;
    await pendingProgressWrite;

    const coursePack = await getLocalExercise(course.coursePackId);
    if (!coursePack) return { nextCourse: undefined };

    const currentIndex = coursePack.courses.findIndex((item) => item.id === course.id);
    if (currentIndex === -1) return { nextCourse: undefined };

    coursePack.courses[currentIndex].completionCount += 1;
    await saveLocalExercise(coursePack);
    course.completionCount = coursePack.courses[currentIndex].completionCount;

    return { nextCourse: coursePack.courses[currentIndex + 1] };
  }

  async function setup(coursePackId: string, courseId: string) {
    translationRequest++;
    translationLoading.value = false;
    translationError.value = "";
    const coursePack = await getLocalExercise(coursePackId);
    const course = coursePack?.courses.find((item) => item.id === courseId);
    if (!course) throw new Error("本地找不到该练习卡片");

    const groups = groupExerciseSentences(course.statements);
    if (
      (!practiceModeAvailability.progressive && !groups) ||
      (!practiceModeAvailability.single &&
        course.practiceSequence !== "lazy-comma-segments-v1" &&
        course.practiceSequence !== "lazy-clause-segments-v1" &&
        (!groups || groups.some((group) => !course.statements[group.end].sentenceChinese?.trim())))
    ) {
      throw new Error("该练习缺少原句分组或完整中文提示，请重新生成以使用整句优先和全文模式。");
    }
    if (!practiceModeAvailability.progressive && course.practiceSequence !== "comma-segments-v1") {
      course.learningMode = "sentence-first";
      course.sentenceFirstStartIndex = undefined;
    }
    if (!practiceModeAvailability.single) course.practiceView = "fulltext";

    const lastIndex = Math.max(0, course.statements.length - 1);
    course.statementIndex = Number.isFinite(course.statementIndex)
      ? Math.min(Math.max(0, Math.trunc(course.statementIndex)), lastIndex)
      : 0;
    currentCourse.value = course;
    if (isLazy.value) {
      const completedRun = course.resumeStatementIndex === null;
      lazyReviewMode.value = course.completionCount > 0 || completedRun;
      course.learningMode = "sentence-first";
      course.sentenceFirstStartIndex = undefined;
      if (completedRun) {
        course.statementIndex = 0;
        course.resumeStatementIndex = 0;
      }
      lazyStepIndex.value = lazyReview()
        ? lazySpans(course.statementIndex).length - 1
        : Math.min(
            Math.max(0, course.resumeStepIndex ?? 0),
            lazySpans(course.statementIndex).length - 1,
          );
      course.resumeStepIndex = lazyStepIndex.value;
    }
    if (course.practiceSequence === "comma-segments-v1") {
      const completedRun = course.resumeStatementIndex === null;
      course.learningMode = hasFinishedFirstPass(course) ? "sentence-first" : "progressive";
      course.sentenceFirstStartIndex = undefined;
      if (completedRun) {
        course.statementIndex = sentenceFirstIndices(groups ?? [])[0] ?? 0;
        course.resumeStatementIndex = course.statementIndex;
      }
    }
    if (course.practiceView !== "fulltext" || !canUseFulltext.value) course.practiceView = "single";
    currentAnswerAccepted.value = false;
    fulltextCompleted.value = false;
    if (canUseSentenceFirst.value && course.learningMode === undefined) {
      course.learningMode = "sentence-first";
      course.sentenceFirstStartIndex = undefined;
    }
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
    normalizeResumeStatementIndex(course.statementIndex);
    unitStatements.clear();
    sourcesByUnitId.clear();
    const firstUnitOrder = new Map<string, number>();
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
    recovery.value = new ReviewRecovery(sourcesByUnitId);
    recoveryUnitId.value = undefined;
    setupStatement(currentCourse);
    refreshCurrentStatement();
    if (!practiceModeAvailability.progressive || !practiceModeAvailability.single)
      persistProgress();
    if (isLazy.value) void ensureCurrentTranslation();
  }

  function translationKey(course: Course, index: number, step: number) {
    return `${course.coursePackId}:${course.id}:${course.statements[index].id}:${step}`;
  }

  function loadStepTranslation(course: Course, index: number, step: number): Promise<string> {
    const base = course.statements[index];
    const cached = base.stepTranslations?.[step];
    if (cached) return Promise.resolve(cached);
    const key = translationKey(course, index, step);
    const pending = pendingTranslations.get(key);
    if (pending) return pending;
    const task = (async () => {
      let chinese = fetchedTranslations.get(key);
      if (!chinese) {
        const [start, end] = lazySpans(index)[step];
        const result = await translatePracticeStep(base.english.slice(start, end));
        chinese = result.chinese.trim();
        if (!chinese) throw new Error("翻译服务返回空译文，请重试。");
        fetchedTranslations.set(key, chinese);
      }
      const whole = step === lazySpans(index).length - 1;
      await saveLocalExerciseTranslation(
        course.coursePackId,
        course.id,
        index,
        step,
        chinese,
        whole,
      );
      base.stepTranslations = { ...base.stepTranslations, [step]: chinese };
      if (whole) base.sentenceChinese = chinese;
      return chinese;
    })();
    pendingTranslations.set(key, task);
    void task
      .finally(() => {
        if (pendingTranslations.get(key) === task) pendingTranslations.delete(key);
      })
      .catch(() => {});
    return task;
  }

  function nextLazyStep(index: number, step: number): [number, number] | undefined {
    const course = currentCourse.value;
    if (!course) return;
    const lastStep = lazySpans(index).length - 1;
    if (step < lastStep) return [index, step + 1];
    const nextIndex = questionIndices.value[questionIndices.value.indexOf(index) + 1];
    if (nextIndex === undefined) return;
    const nextLastStep = lazySpans(nextIndex).length - 1;
    if (
      lazyReview() ||
      (course.resumeStatementIndex !== index && course.resumeStatementIndex !== nextIndex)
    )
      return [nextIndex, nextLastStep];
    if (course.resumeStatementIndex === index) return [nextIndex, 0];
    return [nextIndex, Math.min(course.resumeStepIndex ?? 0, nextLastStep)];
  }

  function prefetchNextTranslation(course: Course, index: number, step: number) {
    if (
      currentCourse.value !== course ||
      statementIndex.value !== index ||
      lazyStepIndex.value !== step
    )
      return;
    const next = nextLazyStep(index, step);
    if (next) void loadStepTranslation(course, next[0], next[1]).catch(() => {});
  }

  async function ensureCurrentTranslation() {
    if (!isLazy.value) return;
    const course = currentCourse.value;
    const base = course?.statements[statementIndex.value];
    if (!course || !base) return;
    const index = statementIndex.value;
    const step = lazyStepIndex.value;
    const request = ++translationRequest;
    translationError.value = "";
    const cached = base.stepTranslations?.[step];
    if (cached) {
      translationLoading.value = false;
      currentStatement.value!.sentenceChinese = cached;
      prefetchNextTranslation(course, index, step);
      return;
    }
    translationLoading.value = true;
    try {
      const chinese = await loadStepTranslation(course, index, step);
      if (request === translationRequest) {
        currentStatement.value!.sentenceChinese = chinese;
        prefetchNextTranslation(course, index, step);
      }
    } catch (error) {
      if (request === translationRequest)
        translationError.value = error instanceof Error ? error.message : "翻译失败，请重试。";
    } finally {
      if (request === translationRequest) translationLoading.value = false;
    }
  }

  return {
    statementIndex,
    currentCourse,
    currentStatement,
    translationLoading,
    translationError,
    translationReady,
    ensureCurrentTranslation,
    learningMode,
    canUseSentenceFirst,
    practiceView,
    isFulltext,
    canUseFulltext,
    sentences,
    precedingSentences,
    currentSentenceIndex,
    fulltextCompleted,
    switchPracticeView,
    baseStatements,
    questionIndex,
    resumeQuestionIndex,
    switchLearningMode,
    isRecovering,
    canDecomposeCurrentUnit,
    isAnsweringBaseUnit,
    words,
    originalSentence,
    isCommaSegmentQuestion,
    currentPracticeText,
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
    canJumpToStatement,
    toSpecificStatement,
    toPreviousStatement,
    toNextStatement,
    resetStatementIndex,
  };
});
