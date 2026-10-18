<template>
  <div
    class="relative flex min-w-0 max-w-full flex-wrap items-center justify-between gap-y-2 border-t border-solid border-slate-200 py-3 text-base dark:border-slate-500"
    data-testid="practice-toolbar"
  >
    <!-- 左侧 -->
    <div class="flex min-w-0 flex-none items-start gap-2">
      <NuxtLink
        href="/course-pack"
        class="clickable-item flex h-11 shrink-0 items-center justify-center"
      >
        <IconsExpand class="h-7 w-7" />
      </NuxtLink>
      <div
        v-if="practiceModeAvailability.progressive || practiceModeAvailability.single"
        class="flex min-w-0 flex-1 gap-2 sm:max-w-md"
      >
        <LearningModeSwitch v-if="practiceModeAvailability.progressive" />
        <PracticeViewSwitch v-if="practiceModeAvailability.single" />
      </div>
    </div>

    <!-- 右侧 -->
    <div class="ml-2 flex min-h-11 min-w-0 flex-1 items-center justify-end gap-2">
      <div
        class="clickable-item tooltip-item min-w-0 truncate text-right"
        data-tip="练习卡片列表"
        @click="toggleContents"
      >
        目录
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
import { ref } from "vue";

import { useQuestionInput } from "~/components/main/QuestionInput/questionInputHelper";
import { courseTimer } from "~/composables/courses/courseTimer";
import { useGameMode } from "~/composables/main/game";
import { clearQuestionInput } from "~/composables/main/question";
import { useExerciseStore } from "~/store/exercise";
import { useExerciseCatalogStore } from "~/store/exerciseCatalog";
import { practiceModeAvailability } from "~/utils/practiceModes";
import { useContent } from "./Contents/useContents";
import LearningModeSwitch from "./LearningModeSwitch.vue";
import PracticeViewSwitch from "./PracticeViewSwitch.vue";

const courseStore = useExerciseStore();
const exerciseCatalogStore = useExerciseCatalogStore();
const { focusInput } = useQuestionInput();
const { toggleContents } = useContent();
const { showTipModal, handleDoAgain, handleTipConfirm } = useDoAgain();

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
