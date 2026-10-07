<template>
  <div
    ref="questionRootEl"
    class="question-content h-full min-h-0 w-full min-w-0 overflow-y-auto overflow-x-hidden text-left"
    :class="{ 'fulltext-flow': courseStore.isFulltext }"
    :style="questionStyle"
  >
    <div class="question-content-flow">
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
      <AnswerHintButton
        v-if="!courseStore.isFulltext && !courseStore.canDecomposeCurrentUnit"
        class="mt-3"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";

import AnswerHintButton from "~/components/main/AnswerHintButton.vue";
import { useQuestionFontSize } from "~/composables/main/questionFontSize";
import { useExerciseStore } from "~/store/exercise";
import { findLargestFittingFontSize, QUESTION_FONT_MAX_SIZE_PX } from "./questionLayoutHelper";

const courseStore = useExerciseStore();
const questionRootEl = ref<HTMLElement>();
const { questionFontSize } = useQuestionFontSize();
const questionStyle = computed(() =>
  courseStore.isFulltext
    ? undefined
    : {
        "--question-font-size": `${questionFontSize.value}px`,
      },
);
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
  if (courseStore.isFulltext) return;
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
  if (courseStore.isFulltext) return;
  if (fitFrame !== undefined) {
    window.cancelAnimationFrame(fitFrame);
  }

  fitFrame = window.requestAnimationFrame(() => {
    fitFrame = undefined;
    void nextTick(fitQuestionFontSize);
  });
}

onMounted(() => {
  if (courseStore.isFulltext) return;
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

.question-content.fulltext-flow {
  height: auto;
  overflow: visible;
  font-size: inherit;
  line-height: inherit;
  padding: 0;
}

.fulltext-flow .question-prompt,
.fulltext-flow .question-sentence {
  margin: 0;
  line-height: inherit;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
</style>
