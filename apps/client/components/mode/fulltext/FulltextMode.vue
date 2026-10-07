<template>
  <div
    ref="scrollEl"
    class="fulltext-body relative h-full min-h-0 w-full min-w-0 overflow-y-auto overflow-x-hidden overscroll-contain"
    data-testid="fulltext-scroll"
    role="region"
    aria-label="全文内容"
    tabindex="0"
  >
    <ol
      class="pb-6"
      aria-label="全文句序"
    >
      <li
        v-for="(sentence, index) in courseStore.sentences"
        :key="sentence.id"
        class="min-w-0 break-words"
        data-testid="fulltext-sentence"
        :data-sentence-id="sentence.id"
        :aria-current="index === courseStore.currentSentenceIndex ? 'step' : undefined"
      >
        <div
          v-if="index < courseStore.currentSentenceIndex"
          data-testid="fulltext-history-sentence"
        >
          <p class="dark:text-gray-50">{{ sentence.chinese }}</p>
          <p class="whitespace-pre-wrap dark:text-gray-50">{{ sentence.english }}</p>
        </div>
        <section
          v-else-if="index === courseStore.currentSentenceIndex"
          class="min-w-0"
          data-testid="fulltext-current"
          aria-label="当前句"
        >
          <div v-if="courseStore.fulltextCompleted">
            <p class="dark:text-gray-50">{{ sentence.chinese }}</p>
            <p class="whitespace-pre-wrap break-words dark:text-gray-50">{{ sentence.english }}</p>
          </div>
          <ModeClozeMode v-else />
        </section>
        <div
          v-else
          class="relative select-none"
          :style="{ height: `${maskLayouts[sentence.id]?.height ?? 29.25}px` }"
          data-testid="fulltext-pending-sentence"
        >
          <span class="sr-only">待练句</span>
          <div
            v-for="(line, lineIndex) in maskLayouts[sentence.id]?.lines ?? []"
            :key="lineIndex"
            class="pointer-events-none absolute rounded-sm bg-slate-300 dark:bg-slate-600"
            :style="{
              left: `${line.left}px`,
              top: `${line.top}px`,
              width: `${line.width}px`,
              height: `${line.height}px`,
            }"
            data-testid="fulltext-pending-bar"
            aria-hidden="true"
          ></div>
        </div>
      </li>
    </ol>
  </div>
</template>

<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref, watch } from "vue";

import type { ChineseMaskLayout } from "./chineseMaskLayout";
import { useExerciseStore } from "~/store/exercise";
import { measureChineseMasks } from "./chineseMaskLayout";

const courseStore = useExerciseStore();
const scrollEl = ref<HTMLElement>();
const maskLayouts = ref<Record<string, ChineseMaskLayout>>({});
let resizeObserver: ResizeObserver | undefined;
let measureFrame: number | undefined;
let measuredWidth = -1;
let disposed = false;

function measureMasks() {
  const scroll = scrollEl.value;
  if (!scroll || scroll.clientWidth <= 0) return;
  measuredWidth = scroll.clientWidth;
  maskLayouts.value = measureChineseMasks(scroll, courseStore.sentences);
}

function scheduleMaskMeasurement() {
  if (disposed || measureFrame !== undefined) return;
  measureFrame = window.requestAnimationFrame(() => {
    measureFrame = undefined;
    if (disposed) return;
    measureMasks();
  });
}

watch(() => courseStore.sentences, scheduleMaskMeasurement);

async function revealCurrentSentence() {
  await nextTick();
  const scroll = scrollEl.value;
  const current = scroll?.querySelector<HTMLElement>('[data-testid="fulltext-current"]');
  const contextSpace = Math.min(96, (scroll?.clientHeight ?? 300) * 0.18);
  if (scroll && current) scroll.scrollTop = Math.max(0, current.offsetTop - contextSpace);
}

watch(
  () => [
    courseStore.currentStatement?.id,
    courseStore.statementIndex,
    courseStore.learningMode,
    courseStore.fulltextCompleted,
  ],
  revealCurrentSentence,
);

onMounted(() => {
  const scroll = scrollEl.value;
  if (!scroll) return;
  resizeObserver = new ResizeObserver(() => {
    if (scroll.clientWidth !== measuredWidth) scheduleMaskMeasurement();
  });
  resizeObserver.observe(scroll);
  scheduleMaskMeasurement();
  document.fonts?.addEventListener("loadingdone", scheduleMaskMeasurement);
  void document.fonts?.ready.then(scheduleMaskMeasurement);
  void revealCurrentSentence();
});

onUnmounted(() => {
  disposed = true;
  resizeObserver?.disconnect();
  if (measureFrame !== undefined) window.cancelAnimationFrame(measureFrame);
  document.fonts?.removeEventListener("loadingdone", scheduleMaskMeasurement);
});
</script>

<style scoped>
.fulltext-body {
  font-size: 18px;
  line-height: 1.625;
}

.fulltext-body > ol > li + li {
  margin-top: 18px;
}

.fulltext-body p {
  margin: 0;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.fulltext-body :deep(.question-input-words) {
  row-gap: 0;
}

.fulltext-body :deep(.question-input-word),
.fulltext-body :deep(.cloze-punctuation) {
  min-height: 1.625em;
  line-height: 1.625;
}

/* Draw the underline inside the line box so it cannot change text line height. */
.fulltext-body :deep(.question-content .question-input-word) {
  position: relative;
  border-bottom-width: 0;
}

.fulltext-body :deep(.question-content .question-input-word)::after {
  content: "";
  position: absolute;
  /* Exclude half the extra leading; match the single view's 1em text box + 2px border. */
  inset: auto 0 calc((1.625em - 1em) / 2 - 2px);
  border-bottom: 2px solid;
  border-bottom-color: inherit;
  pointer-events: none;
}
</style>
