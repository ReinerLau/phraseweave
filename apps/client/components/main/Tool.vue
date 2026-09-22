<template>
  <div
    class="relative flex min-w-0 max-w-full items-center justify-between border-t border-solid border-slate-200 py-3 text-base dark:border-slate-500"
  >
    <!-- 左侧 -->
    <div class="flex min-w-0 flex-1 items-center">
      <NuxtLink
        href="/course-pack"
        class="clickable-item tooltip-item tooltip-bottom shrink-0"
        data-tip="练习清单"
      >
        <IconsExpand class="h-7 w-7" />
      </NuxtLink>
    </div>

    <!-- 右侧 -->
    <div class="flex min-w-0 max-w-[75%] items-center">
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
import { useExerciseStore } from "~/store/exercise";
import { useExerciseCatalogStore } from "~/store/exerciseCatalog";
import { useContent } from "./Contents/useContents";

const courseStore = useExerciseStore();
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
