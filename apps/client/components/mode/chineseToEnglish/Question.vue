<template>
  <div
    ref="questionRootEl"
    class="question-content h-full min-h-0 w-full min-w-0 overflow-hidden text-left"
    :style="questionStyle"
  >
    <div class="question-content-flow">
      <div
        class="question-prompt dark:text-gray-50"
        data-testid="question-prompt"
      >
        {{ courseStore.currentStatement?.chinese || "生存还是毁灭，这是一个问题" }}
      </div>
      <MainQuestionInput />
      <div
        class="question-content-bottom-spacer"
        aria-hidden="true"
      ></div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";

import { useCurrentStatementEnglishSound } from "~/composables/main/englishSound";
import { useQuestionFontSize } from "~/composables/main/questionFontSize";
import { useAutoPlayEnglish } from "~/composables/user/sound";
import { useExerciseStore } from "~/store/exercise";
import { findLargestFittingFontSize, QUESTION_FONT_MAX_SIZE_PX } from "./questionLayoutHelper";

const courseStore = useExerciseStore();
const { playSound } = useCurrentStatementEnglishSound();
const { isAutoPlayEnglish } = useAutoPlayEnglish();
const questionRootEl = ref<HTMLElement>();
const { questionFontSize } = useQuestionFontSize();
const questionStyle = computed(() => ({
  "--question-font-size": `${questionFontSize.value}px`,
}));
let resizeObserver: ResizeObserver | undefined;
let fitFrame: number | undefined;

onMounted(() => {
  handleAutoPlayEnglish();
});

watch(
  () => courseStore.currentStatement,
  () => {
    handleAutoPlayEnglish();
    scheduleQuestionFontSize();
  },
);

function handleAutoPlayEnglish() {
  if (isAutoPlayEnglish()) {
    playSound();
  }
}

function contentFits() {
  const root = questionRootEl.value;
  if (!root) return true;

  const contentFlow = root.querySelector<HTMLElement>(".question-content-flow");
  if (!contentFlow) return false;

  const rootRect = root.getBoundingClientRect();
  const rootStyles = window.getComputedStyle(root);
  const availableBottom = rootRect.bottom - parseFloat(rootStyles.borderBottomWidth);
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
  font-size: var(--question-font-size);
}

.question-content-flow {
  width: 100%;
  min-width: 0;
}

.question-content-bottom-spacer {
  width: 100%;
  height: 1rem;
}

.question-prompt {
  margin: 0 0 0.5em;
  font-size: inherit;
  line-height: 1.25;
  overflow-wrap: anywhere;
}
</style>
