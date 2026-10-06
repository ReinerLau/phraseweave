<template>
  <div
    class="flex min-h-0 w-full min-w-0 flex-col items-start justify-start"
    :class="courseStore.isFulltext ? 'h-auto overflow-visible' : 'h-full overflow-hidden'"
  >
    <template v-if="isQuestion()">
      <ModeClozeQuestion />
    </template>
    <template v-else-if="isAnswer()">
      <MainAnswer />
    </template>
  </div>
</template>

<script setup lang="ts">
import { useGameMode } from "~/composables/main/game";
import { useExerciseStore } from "~/store/exercise";

const courseStore = useExerciseStore();
const { isAnswer, isQuestion } = useGameMode();
</script>
