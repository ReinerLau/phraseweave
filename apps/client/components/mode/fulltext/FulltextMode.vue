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
      v-if="courseStore.precedingSentences.length"
      class="space-y-5 pb-6 text-lg leading-relaxed"
      aria-label="前文"
    >
      <li
        v-for="sentence in courseStore.precedingSentences"
        :key="sentence.id"
        class="min-w-0 break-words"
        data-testid="fulltext-history-sentence"
      >
        <p class="text-gray-600 dark:text-gray-400">{{ sentence.chinese }}</p>
        <p class="whitespace-pre-wrap text-gray-900 dark:text-gray-100">{{ sentence.english }}</p>
      </li>
    </ol>
    <section
      ref="currentEl"
      class="flex min-h-0 w-full min-w-0 flex-col"
      :style="{ height: `${currentHeight}px` }"
      data-testid="fulltext-current"
      aria-label="当前句"
    >
      <p class="mb-3 shrink-0 text-sm text-gray-500 dark:text-gray-400">
        第 {{ courseStore.currentSentenceIndex + 1 }} / {{ courseStore.sentences.length }} 句
      </p>
      <div
        v-if="courseStore.fulltextCompleted"
        class="text-lg leading-relaxed"
      >
        <p class="text-gray-600 dark:text-gray-400">{{ currentSentence?.chinese }}</p>
        <p class="whitespace-pre-wrap break-words dark:text-gray-100">
          {{ currentSentence?.english }}
        </p>
      </div>
      <div
        v-else
        class="min-h-0 min-w-0 flex-1"
      >
        <ModeClozeMode />
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";

import { useGameMode } from "~/composables/main/game";
import { useExerciseStore } from "~/store/exercise";

const courseStore = useExerciseStore();
const { gameMode } = useGameMode();
const scrollEl = ref<HTMLElement>();
const currentEl = ref<HTMLElement>();
const viewportHeight = ref(300);
const historyPeek = computed(() =>
  courseStore.precedingSentences.length ? Math.min(144, viewportHeight.value * 0.28) : 0,
);
const currentHeight = computed(() => Math.max(160, viewportHeight.value - historyPeek.value - 8));
const currentSentence = computed(() => courseStore.sentences[courseStore.currentSentenceIndex]);
let resizeObserver: ResizeObserver | undefined;

async function revealCurrentSentence() {
  await nextTick();
  const scroll = scrollEl.value;
  const current = currentEl.value;
  if (scroll && current) scroll.scrollTop = Math.max(0, current.offsetTop - historyPeek.value);
}

watch(
  () => [
    courseStore.currentStatement?.id,
    courseStore.statementIndex,
    courseStore.learningMode,
    courseStore.fulltextCompleted,
    gameMode.value,
  ],
  revealCurrentSentence,
);

onMounted(() => {
  const scroll = scrollEl.value;
  if (!scroll) return;
  resizeObserver = new ResizeObserver(() => {
    viewportHeight.value = scroll.clientHeight;
    void revealCurrentSentence();
  });
  resizeObserver.observe(scroll);
  viewportHeight.value = scroll.clientHeight;
  void revealCurrentSentence();
});

onUnmounted(() => resizeObserver?.disconnect());
</script>
