<template>
  <button
    v-if="visible"
    ref="buttonEl"
    class="btn btn-square btn-ghost h-11 min-h-11 w-11 min-w-11 p-0 text-2xl text-gray-500 hover:text-fuchsia-500 dark:text-gray-300"
    type="button"
    data-testid="sentence-audio-button"
    :aria-label="label"
    :title="label"
    :aria-busy="loading || undefined"
    :aria-pressed="active"
    @mousedown.prevent
    @click="play"
  >
    <span
      class="h-6 w-6"
      :class="loading ? 'loading loading-spinner' : active ? 'i-ph-stop' : 'i-ph-speaker-high'"
      aria-hidden="true"
    ></span>
    <span class="sr-only">{{ label }}</span>
  </button>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";

import { useSummary } from "~/composables/main/summary";
import { useWordAudio } from "~/composables/useWordAudio";
import { useExerciseStore } from "~/store/exercise";

const store = useExerciseStore();
const { showModal } = useSummary();
const { activeSentence, loadingElement, playSentenceAudio } = useWordAudio();
const buttonEl = ref<HTMLElement>();
const visible = computed(
  () => !!store.originalSentence && !showModal.value && !store.fulltextCompleted,
);
const active = computed(() => activeSentence.value === store.originalSentence);
const loading = computed(() => !!buttonEl.value && loadingElement.value === buttonEl.value);
const label = computed(() => (active.value ? "停止朗读" : "朗读原句"));

function play() {
  if (buttonEl.value) void playSentenceAudio(store.originalSentence, buttonEl.value);
}
</script>
