<template>
  <div
    ref="scrollEl"
    class="relative h-full min-h-0 w-full min-w-0 overflow-y-auto overflow-x-hidden overscroll-contain"
    data-testid="fulltext-scroll"
    role="region"
    aria-label="全文内容"
    tabindex="0"
  >
    <ol
      class="space-y-5 pb-6 text-lg leading-relaxed"
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
          <p class="text-gray-600 dark:text-gray-400">{{ sentence.chinese }}</p>
          <p class="whitespace-pre-wrap text-gray-900 dark:text-gray-100">{{ sentence.english }}</p>
        </div>
        <section
          v-else-if="index === courseStore.currentSentenceIndex"
          class="flex min-h-0 w-full min-w-0 flex-col"
          :style="courseStore.fulltextCompleted ? undefined : { height: `${currentHeight}px` }"
          data-testid="fulltext-current"
          aria-label="当前句"
        >
          <p class="mb-3 shrink-0 text-sm text-gray-500 dark:text-gray-400">
            第 {{ index + 1 }} / {{ courseStore.sentences.length }} 句
          </p>
          <div v-if="courseStore.fulltextCompleted">
            <p class="text-gray-600 dark:text-gray-400">{{ sentence.chinese }}</p>
            <p class="whitespace-pre-wrap break-words dark:text-gray-100">{{ sentence.english }}</p>
          </div>
          <div
            v-else
            class="min-h-0 min-w-0 flex-1"
          >
            <ModeClozeMode />
          </div>
        </section>
        <div
          v-else
          class="py-2"
          data-testid="fulltext-pending-sentence"
        >
          <span class="sr-only">第 {{ index + 1 }} 句，待练习</span>
          <div
            class="h-5 w-full max-w-sm rounded bg-slate-300 dark:bg-slate-600"
            data-testid="fulltext-pending-bar"
            aria-hidden="true"
          ></div>
        </div>
      </li>
    </ol>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";

import { useExerciseStore } from "~/store/exercise";

const courseStore = useExerciseStore();
const scrollEl = ref<HTMLElement>();
const viewportHeight = ref(300);
const currentHeight = computed(() => Math.max(180, Math.min(320, viewportHeight.value * 0.5)));
let resizeObserver: ResizeObserver | undefined;

async function revealCurrentSentence() {
  await nextTick();
  const scroll = scrollEl.value;
  const current = scroll?.querySelector<HTMLElement>('[data-testid="fulltext-current"]');
  const contextSpace = Math.min(96, viewportHeight.value * 0.18);
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
    viewportHeight.value = scroll.clientHeight;
  });
  resizeObserver.observe(scroll);
  viewportHeight.value = scroll.clientHeight;
  void revealCurrentSentence();
});

onUnmounted(() => resizeObserver?.disconnect());
</script>
