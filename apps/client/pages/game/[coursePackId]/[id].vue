<template>
  <div
    class="flex min-h-0 w-full min-w-0 flex-col overflow-hidden pt-2"
    :style="{
      height: practiceViewportHeight ? `${practiceViewportHeight}px` : '100dvh',
    }"
  >
    <template v-if="isLoading">
      <Loading></Loading>
    </template>
    <template v-else>
      <MainTool />
      <div class="h-0 min-h-0 min-w-0 flex-1 overflow-hidden">
        <MainGame />
      </div>
      <p
        v-if="audioError"
        class="shrink-0 px-4 text-sm text-red-600"
        role="status"
        aria-live="polite"
      >
        {{ audioError }}
      </p>
      <MainTips class="shrink-0" />
    </template>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from "vue";
import { useRoute } from "vue-router";

import { useGameMode } from "~/composables/main/game";
import { useWordAudio } from "~/composables/useWordAudio";
import { useExerciseStore } from "~/store/exercise";

const isLoading = ref(true);
const route = useRoute();
const coursesStore = useExerciseStore();
const { audioError, stopWordAudio, disposeWordAudio } = useWordAudio();
watch(
  () => [
    coursesStore.currentStatement?.id,
    coursesStore.statementIndex,
    coursesStore.learningMode,
    coursesStore.practiceView,
    coursesStore.fulltextCompleted,
  ],
  stopWordAudio,
);
const { showQuestion } = useGameMode();
const practiceViewportHeight = ref<number>();

function updatePracticeViewportHeight() {
  const viewport = window.visualViewport;
  practiceViewportHeight.value = viewport?.height || window.innerHeight;
}

showQuestion();

onMounted(async () => {
  updatePracticeViewportHeight();
  window.visualViewport?.addEventListener("resize", updatePracticeViewportHeight);
  window.addEventListener("resize", updatePracticeViewportHeight);

  const { coursePackId, id } = route.params;
  await coursesStore.setup(coursePackId as string, id as string);

  isLoading.value = false;
});

onUnmounted(() => {
  disposeWordAudio();
  window.visualViewport?.removeEventListener("resize", updatePracticeViewportHeight);
  window.removeEventListener("resize", updatePracticeViewportHeight);
});
</script>
