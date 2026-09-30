<template>
  <div
    v-if="isAnswer()"
    class="relative flex min-h-10 w-full items-stretch justify-start gap-2 py-1"
    data-testid="practice-tips"
  >
    <button
      class="btn btn-outline btn-sm h-12 min-h-12 w-0 min-w-0 flex-1 basis-0"
      data-testid="show-answer-button"
      aria-label="再来一次"
      @click="toggleGameMode"
    >
      再来一次
    </button>
    <button
      class="btn btn-outline btn-sm h-12 min-h-12 w-0 min-w-0 flex-1 basis-0"
      data-testid="next-question-button"
      @click="goToNextQuestion"
    >
      下一题
    </button>
  </div>
</template>

<script setup lang="ts">
import {
  useExerciseNavigation,
  useExerciseNavigationShortcuts,
} from "~/composables/main/exerciseNavigation";
import { useGameMode } from "~/composables/main/game";
import { useShowAnswer } from "~/composables/main/showAnswer";

const { isAnswer } = useGameMode();
const { toggleGameMode } = useShowAnswer();
const { goToNextQuestion } = useExerciseNavigation();
useExerciseNavigationShortcuts();
</script>
