<template>
  <div
    class="answer-content h-full min-h-0 w-full min-w-0 max-w-full overflow-y-auto overflow-x-hidden text-left"
    :style="questionStyle"
    data-testid="answer-content"
  >
    <div
      v-if="courseStore.isRecovering"
      class="mb-2 text-sm text-fuchsia-600 dark:text-fuchsia-300"
    >
      回退复习
    </div>
    <div
      class="answer-prompt dark:text-gray-50"
      data-testid="answer-prompt"
    >
      {{ courseStore.currentStatement?.sentenceChinese }}
    </div>
    <div
      class="answer-sentence dark:text-gray-50"
      data-testid="answer-sentence"
    >
      <span class="cloze-context">{{ courseStore.currentStatement?.contextBefore }}</span>
      <div
        ref="answerWordsEl"
        class="answer-words question-input-words relative inline-flex min-w-0 max-w-full flex-wrap items-start justify-start text-left"
      >
        <span
          v-for="(word, index) in words"
          :key="index"
          class="question-input-word min-w-0 max-w-full rounded-[2px] leading-none text-[#20202099] dark:text-gray-300"
          :style="{ width: `${wordWidth(word)}em` }"
          >{{ word }}</span
        >
        <span
          ref="probeEl"
          class="pointer-events-none absolute h-0 w-max whitespace-pre opacity-0"
          aria-hidden="true"
        ></span>
      </div>
      <span class="cloze-context">{{ courseStore.currentStatement?.contextAfter }}</span>
    </div>
    <div
      v-if="courseStore.currentStatement?.soundmark"
      class="my-2 text-xl text-gray-500"
    >
      {{ courseStore.currentStatement?.soundmark }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";

import { useWordWidths } from "~/components/main/QuestionInput/questionInputHelper";
import { useExerciseNavigation } from "~/composables/main/exerciseNavigation";
import { useQuestionFontSize } from "~/composables/main/questionFontSize";
import { useExerciseStore } from "~/store/exercise";
import { cancelShortcut, registerShortcut } from "~/utils/keyboardShortcuts";

const courseStore = useExerciseStore();
const { questionFontSize } = useQuestionFontSize();
const { goToNextQuestion: navigateToNextQuestion } = useExerciseNavigation();

const questionStyle = computed(() => ({
  "--question-font-size": `${questionFontSize.value}px`,
}));

// 与输入区同源的词（english.split(" ")），保证答题后逐块对位
const words = computed(() => courseStore.words);

const answerWordsEl = ref<HTMLElement>();
const { probeEl, wordWidth } = useWordWidths(answerWordsEl);

registerShortcutKeyForNextQuestion();

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
/* 词块样式由 assets/css/globals.css 的 .question-input-words / .question-input-word
   提供（与输入区共享），这里只保留答案区自己的容器与提示词样式。 */
.answer-content {
  --question-font-size: 2.25rem;
  font-size: var(--question-font-size);
}

.answer-prompt {
  margin: 0 0 0.5em;
  font-size: inherit;
  line-height: 1.25;
  overflow-wrap: anywhere;
}

.answer-sentence {
  line-height: 1.25;
  overflow-wrap: anywhere;
}

.cloze-context {
  white-space: pre-wrap;
}

.answer-words {
  width: fit-content;
  vertical-align: bottom;
}
</style>
