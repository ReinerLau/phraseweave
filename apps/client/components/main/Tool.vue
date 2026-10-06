<template>
  <div
    class="relative flex min-w-0 max-w-full flex-wrap items-center justify-between gap-y-2 border-t border-solid border-slate-200 py-3 text-base dark:border-slate-500"
  >
    <!-- 左侧 -->
    <div class="flex w-full min-w-0 flex-none items-start gap-2 sm:w-auto sm:flex-1">
      <NuxtLink
        href="/course-pack"
        class="clickable-item shrink-0"
      >
        <IconsExpand class="h-7 w-7" />
      </NuxtLink>
      <div class="grid min-w-0 flex-1 grid-cols-2 gap-2 sm:max-w-md">
        <LearningModeSwitch />
        <PracticeViewSwitch />
      </div>
    </div>

    <!-- 右侧 -->
    <div
      class="flex w-full min-w-0 items-center justify-end gap-2 sm:ml-2 sm:w-auto sm:max-w-[30%]"
      :class="{ 'min-h-11': courseStore.isFulltext }"
    >
      <AnswerHintButton
        v-if="showFulltextAnswerHint"
        class="shrink-0"
      />
      <div
        class="clickable-item tooltip-item min-w-0 truncate text-right"
        data-tip="练习卡片列表"
        @click="toggleContents"
      >
        {{ currentCourseInfo }}
      </div>
    </div>

    <MainContents />
  </div>

  <MainMessageBox
    class="mt-[-4vh]"
    v-model:isShowModal="showTipModal"
    content="是否确认重置当前练习卡片进度？"
    @confirm="handleTipConfirm"
  />
</template>

<script setup lang="ts">
import { computed, ref } from "vue";

import { useQuestionInput } from "~/components/main/QuestionInput/questionInputHelper";
import { courseTimer } from "~/composables/courses/courseTimer";
import { useGameMode } from "~/composables/main/game";
import { clearQuestionInput } from "~/composables/main/question";
import { useSummary } from "~/composables/main/summary";
import { useExerciseStore } from "~/store/exercise";
import { useExerciseCatalogStore } from "~/store/exerciseCatalog";
import AnswerHintButton from "./AnswerHintButton.vue";
import { useContent } from "./Contents/useContents";
import LearningModeSwitch from "./LearningModeSwitch.vue";
import PracticeViewSwitch from "./PracticeViewSwitch.vue";

const courseStore = useExerciseStore();
const { isQuestion } = useGameMode();
const { showModal } = useSummary();
const showFulltextAnswerHint = computed(
  () =>
    courseStore.isFulltext &&
    courseStore.currentStatement &&
    !courseStore.canDecomposeCurrentUnit &&
    isQuestion() &&
    !showModal.value &&
    !courseStore.fulltextCompleted,
);
const exerciseCatalogStore = useExerciseCatalogStore();
const { focusInput } = useQuestionInput();
const { toggleContents } = useContent();
const { showTipModal, handleDoAgain, handleTipConfirm } = useDoAgain();

const currentCourseInfo = computed(() => {
  return courseStore.currentCourse?.title;
});

function useDoAgain() {
  const showTipModal = ref<boolean>(false);
  const { showQuestion } = useGameMode();

  function handleDoAgain() {
    showTipModal.value = true;
  }

  function handleTipConfirm() {
    courseStore.doAgain();
    clearQuestionInput();
    focusInput();
    showQuestion();
    courseTimer.reset();
  }

  return {
    showTipModal,
    handleDoAgain,
    handleTipConfirm,
  };
}
</script>

<style scoped>
.tooltip-item {
  @apply tooltip z-20;
}

.clickable-item {
  @apply cursor-pointer select-none hover:text-fuchsia-500;
}

.icon-item {
  @apply h-6 w-6;
}
</style>
