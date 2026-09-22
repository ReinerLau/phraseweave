<template>
  <div
    class="answer-content h-full min-h-0 w-full min-w-0 max-w-full overflow-hidden text-left"
    :style="questionStyle"
    data-testid="answer-content"
  >
    <div
      class="answer-prompt dark:text-gray-50"
      data-testid="answer-prompt"
    >
      {{ courseStore.currentStatement?.chinese }}
    </div>
    <div
      class="answer-words flex w-full min-w-0 max-w-full flex-wrap items-start justify-start gap-1"
    >
      <span
        v-for="word in words"
        :key="word"
        class="max-w-full cursor-pointer break-words p-1 hover:text-fuchsia-500"
        @click="handlePlayWordSound(word)"
        >{{ word }}</span
      >
    </div>
    <div class="my-2 text-xl text-gray-500">
      {{ courseStore.currentStatement?.soundmark }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted } from "vue";

import { useCurrentStatementEnglishSound } from "~/composables/main/englishSound";
import { usePlayWordSound } from "~/composables/main/englishSound/audio";
import { useExerciseNavigation } from "~/composables/main/exerciseNavigation";
import { useQuestionFontSize } from "~/composables/main/questionFontSize";
import { useAutoPronunciation } from "~/composables/user/sound";
import { useExerciseStore } from "~/store/exercise";
import { cancelShortcut, registerShortcut } from "~/utils/keyboardShortcuts";

const courseStore = useExerciseStore();
const { handlePlayWordSound } = usePlayWordSound();
usePlayEnglishSound();
const { isAutoPlaySound } = useAutoPronunciation();
const { questionFontSize } = useQuestionFontSize();
const { goToNextQuestion: navigateToNextQuestion } = useExerciseNavigation();

const questionStyle = computed(() => ({
  "--question-font-size": `${questionFontSize.value}px`,
}));

const words = computed(() => courseStore.currentStatement?.english.split(" "));

registerShortcutKeyForNextQuestion();

function usePlayEnglishSound() {
  const { playSound } = useCurrentStatementEnglishSound();

  onMounted(() => {
    if (isAutoPlaySound()) {
      playSound();
    }
  });
}

function registerShortcutKeyForNextQuestion() {
  function handleKeydown(e: KeyboardEvent) {
    e.preventDefault(); // 阻止到下一个页面的默认按键动作
    goToNextQuestion();
  }
  onMounted(() => {
    registerShortcut(" ", handleKeydown);
    registerShortcut("enter", handleKeydown);
  });

  onUnmounted(() => {
    cancelShortcut(" ", handleKeydown);
    cancelShortcut("enter", handleKeydown);
  });
}

function goToNextQuestion() {
  navigateToNextQuestion();
}
</script>

<style scoped>
.answer-content {
  --question-font-size: 2.5rem;
  font-size: var(--question-font-size);
}

.answer-prompt {
  margin: 0 0 0.5em;
  font-size: inherit;
  line-height: 1.25;
  overflow-wrap: anywhere;
}

.answer-words {
  font-size: inherit;
  line-height: 1.25;
}

.answer-words span {
  overflow-wrap: anywhere;
}
</style>
