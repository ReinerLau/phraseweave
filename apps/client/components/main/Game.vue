<template>
  <div
    class="flex h-full min-h-0 w-full min-w-0 flex-1 items-center justify-center"
    data-testid="practice-focus-area"
    @click="handleFocusAreaClick"
  >
    <ModeFulltextMode v-if="courseStore.isFulltext" />
    <ModeClozeMode v-else />
  </div>

  <MainSummary />
  <MainAuthRequired />
</template>

<script setup lang="ts">
import { onMounted } from "vue";

import { useQuestionInput } from "~/components/main/QuestionInput/questionInputHelper";
import { courseTimer } from "~/composables/courses/courseTimer";
import { useGameMode as useQuestionGameMode } from "~/composables/main/game";
import { useExerciseStore } from "~/store/exercise";

const { isQuestion } = useQuestionGameMode();
const { focusInput } = useQuestionInput();
const courseStore = useExerciseStore();

function handleFocusAreaClick(event: MouseEvent) {
  if (
    courseStore.isFulltext &&
    !(event.target as HTMLElement).closest('[data-testid="fulltext-current"]')
  )
    return;
  if (isQuestion()) {
    focusInput();
  }
}

onMounted(() => {
  courseTimer.reset();
});
</script>
