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
      <MainTips class="shrink-0" />
      <Footer compact />
      <div class="min-h-0 min-w-0 flex-1 overflow-hidden">
        <MainGame />
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref } from "vue";
import { useRoute } from "vue-router";

import { useGameMode } from "~/composables/main/game";
import { useExerciseStore } from "~/store/exercise";

const isLoading = ref(true);
const route = useRoute();
const coursesStore = useExerciseStore();
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
  window.visualViewport?.removeEventListener("resize", updatePracticeViewportHeight);
  window.removeEventListener("resize", updatePracticeViewportHeight);
});
</script>
