<template>
  <div
    ref="questionRootEl"
    class="question-content h-full min-h-0 w-full min-w-0 overflow-y-auto overflow-x-hidden text-left"
    :style="questionStyle"
  >
    <div class="question-content-flow">
      <div
        v-if="courseStore.isRecovering"
        class="mb-2 text-sm text-fuchsia-600 dark:text-fuchsia-300"
      >
        回退复习
      </div>
      <div
        class="question-prompt dark:text-gray-50"
        data-testid="question-prompt"
      >
        {{ courseStore.currentStatement?.sentenceChinese }}
      </div>
      <div
        class="question-sentence dark:text-gray-50"
        data-testid="cloze-sentence"
      >
        <span class="cloze-context">{{ courseStore.currentStatement?.contextBefore }}</span
        ><MainQuestionInput inline /><span class="cloze-context">{{
          courseStore.currentStatement?.contextAfter
        }}</span>
      </div>
      <button
        class="btn btn-ghost mt-3 min-h-11 text-gray-500 hover:text-fuchsia-500 dark:text-gray-300"
        type="button"
        data-testid="show-answer-button"
        :aria-label="answerTipText"
        @mousedown.prevent
        @click="toggleGameMode"
      >
        {{ answerTipText }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";

import { useAnswerTip } from "~/composables/main/answerTip";
import { useQuestionFontSize } from "~/composables/main/questionFontSize";
import { useShowAnswer } from "~/composables/main/showAnswer";
import { useExerciseStore } from "~/store/exercise";
import { findLargestFittingFontSize, QUESTION_FONT_MAX_SIZE_PX } from "./questionLayoutHelper";

const courseStore = useExerciseStore();
const { isAnswerTip } = useAnswerTip();
const { toggleGameMode } = useShowAnswer();
const answerTipText = computed(() => (isAnswerTip() ? "隐藏答案" : "显示答案"));
const questionRootEl = ref<HTMLElement>();
const { questionFontSize } = useQuestionFontSize();
const questionStyle = computed(() => ({
  "--question-font-size": `${questionFontSize.value}px`,
}));
let resizeObserver: ResizeObserver | undefined;
let fitFrame: number | undefined;

watch(
  () => courseStore.currentStatement,
  () => {
    if (questionRootEl.value) questionRootEl.value.scrollTop = 0;
    scheduleQuestionFontSize();
  },
);

function contentFits() {
  const root = questionRootEl.value;
  if (!root) return true;

  const contentFlow = root.querySelector<HTMLElement>(".question-content-flow");
  if (!contentFlow) return false;

  const rootRect = root.getBoundingClientRect();
  const rootStyles = window.getComputedStyle(root);
  const availableBottom =
    rootRect.bottom -
    parseFloat(rootStyles.borderBottomWidth) -
    parseFloat(rootStyles.paddingBottom);
  const contentBottom = contentFlow.getBoundingClientRect().bottom;

  return contentBottom <= availableBottom + 1 && root.scrollWidth <= root.clientWidth + 1;
}

function setQuestionFontSize(size: number) {
  questionFontSize.value = size;
  questionRootEl.value?.style.setProperty("--question-font-size", `${size}px`);
}

function fitQuestionFontSize() {
  const root = questionRootEl.value;
  if (!root || root.clientHeight <= 0 || root.clientWidth <= 0) return;

  setQuestionFontSize(QUESTION_FONT_MAX_SIZE_PX);
  const fittingSize = findLargestFittingFontSize((size) => {
    setQuestionFontSize(size);
    void root.offsetHeight;
    return contentFits();
  });

  setQuestionFontSize(fittingSize);
}

function scheduleQuestionFontSize() {
  if (fitFrame !== undefined) {
    window.cancelAnimationFrame(fitFrame);
  }

  fitFrame = window.requestAnimationFrame(() => {
    fitFrame = undefined;
    void nextTick(fitQuestionFontSize);
  });
}

onMounted(() => {
  const root = questionRootEl.value;
  if (!root) return;

  resizeObserver = new ResizeObserver(scheduleQuestionFontSize);
  resizeObserver.observe(root);
  scheduleQuestionFontSize();
});

onUnmounted(() => {
  resizeObserver?.disconnect();
  if (fitFrame !== undefined) {
    window.cancelAnimationFrame(fitFrame);
  }
});
</script>

<style scoped>
.question-content {
  --question-font-size: 2.25rem;
  --question-content-bottom-space: 1rem;
  font-size: var(--question-font-size);
  padding-bottom: var(--question-content-bottom-space);
}

.question-content-flow {
  width: 100%;
  min-width: 0;
}

.question-prompt {
  margin: 0 0 0.5em;
  font-size: inherit;
  line-height: 1.25;
  overflow-wrap: anywhere;
}

.question-sentence {
  line-height: 1.25;
  overflow-wrap: anywhere;
}

.cloze-context {
  white-space: pre-wrap;
}
</style>
