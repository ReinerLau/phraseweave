<template>
  <button
    v-if="visible"
    ref="buttonEl"
    class="ml-1 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded p-0 align-middle text-gray-500 hover:text-fuchsia-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-fuchsia-500 dark:text-gray-300"
    type="button"
    data-testid="sentence-audio-button"
    :aria-label="label"
    :title="label"
    :aria-busy="loading || undefined"
    :aria-pressed="active"
    @mousedown.prevent
    @click.stop="play"
    @keydown.enter.stop.prevent="play"
    @keydown.space.stop.prevent="play"
    @keyup.space.stop.prevent
  >
    <span
      class="h-5 w-5"
      :class="loading ? 'loading loading-spinner' : active ? 'i-ph-stop' : 'i-ph-speaker-high'"
      aria-hidden="true"
    ></span>
  </button>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";

import { useSummary } from "~/composables/main/summary";
import { useWordAudio } from "~/composables/useWordAudio";

const props = defineProps<{ text: string }>();
const { showModal } = useSummary();
const { activeSentence, activeElement, loadingElement, playSentenceAudio, stopWordAudio } =
  useWordAudio();
const buttonEl = ref<HTMLElement>();
const visible = computed(() => !!props.text.trim() && !showModal.value);
const active = computed(
  () => activeSentence.value === props.text && activeElement.value === buttonEl.value,
);
const loading = computed(() => !!buttonEl.value && loadingElement.value === buttonEl.value);
const label = computed(() => (active.value ? "停止朗读" : "朗读原句"));

function play() {
  if (buttonEl.value) void playSentenceAudio(props.text, buttonEl.value);
}

function stopIfActive() {
  if (buttonEl.value && activeElement.value === buttonEl.value) stopWordAudio();
}

watch(() => props.text, stopIfActive);
watch(showModal, (show) => {
  if (show) stopIfActive();
});
onBeforeUnmount(stopIfActive);
</script>
