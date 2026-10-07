<template>
  <button
    class="btn btn-square btn-ghost h-11 min-h-11 w-11 min-w-11 p-0 text-2xl text-gray-500 hover:text-fuchsia-500 dark:text-gray-300"
    type="button"
    data-testid="show-answer-button"
    :aria-label="answerTipText"
    :title="answerTipText"
    @mousedown.prevent
    @click="toggleGameMode"
  >
    <span
      class="h-6 w-6"
      :class="isAnswerTip() ? 'i-ph-eye-slash' : 'i-ph-eye'"
      aria-hidden="true"
    ></span>
    <span class="sr-only">{{ answerTipText }}</span>
  </button>
</template>

<script setup lang="ts">
import { computed } from "vue";

import { useAnswerTip } from "~/composables/main/answerTip";
import { useShowAnswer } from "~/composables/main/showAnswer";

const { isAnswerTip } = useAnswerTip();
const { toggleGameMode } = useShowAnswer();
const answerTipText = computed(() => (isAnswerTip() ? "隐藏答案" : "显示答案"));
</script>
