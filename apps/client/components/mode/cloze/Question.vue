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
        class="question-sentence practice-english dark:text-gray-50"
        data-testid="cloze-sentence"
      >
        <SpeakableText
          class="cloze-context"
          :text="courseStore.currentStatement?.contextBefore"
        /><MainQuestionInput
          inline
          @hint-change="updatePhoneticHint"
        /><SpeakableText
          class="cloze-context"
          :text="courseStore.currentStatement?.contextAfter"
        /><span
          v-if="phoneticSyllables"
          class="phonetic-hint text-slate-500 dark:text-slate-300"
          data-testid="phonetic-hint"
          role="status"
          aria-label="音标提示"
          >{{ " "
          }}<template
            v-for="(syllable, index) in phoneticSyllables"
            :key="index"
            >{{ index > 0 ? " " : ""
            }}<span class="phonetic-syllable"
              ><span
                v-if="index > 0"
                aria-hidden="true"
                >· </span
              >/{{ syllable }}/</span
            ></template
          ></span
        >
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";

import SpeakableText from "~/components/SpeakableText.vue";
import { useQuestionFontSize } from "~/composables/main/questionFontSize";
import { useExerciseStore } from "~/store/exercise";
import { findLargestFittingFontSize, QUESTION_FONT_MAX_SIZE_PX } from "./questionLayoutHelper";

const courseStore = useExerciseStore();
const questionRootEl = ref<HTMLElement>();
const phoneticSyllables = ref<string[]>();
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

function updatePhoneticHint(syllables: string[] | undefined) {
  phoneticSyllables.value = syllables;
  scheduleQuestionFontSize();
}

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
  // Focus and scroll anchoring can move the viewport while the font is resized.
  const contentBottom = contentFlow.getBoundingClientRect().bottom + root.scrollTop;

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
  root.scrollTop = 0;
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

.phonetic-hint {
  display: inline;
  white-space: normal;
  font-family: "Arial", "Helvetica", sans-serif;
  font-size: max(1em, 20px);
  line-height: 1.35;
}

.phonetic-syllable {
  display: inline-block;
  white-space: nowrap;
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
