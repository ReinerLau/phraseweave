<template>
  <span
    ref="wordEl"
    :class="{ 'speech-word': speakable, 'speech-loading': loadingElement === wordEl }"
    :role="speakable ? 'button' : undefined"
    :tabindex="speakable ? 0 : undefined"
    :title="speakable ? `朗读 ${text}` : undefined"
    :aria-label="speakable ? `朗读 ${text}` : undefined"
    :aria-busy="loadingElement === wordEl || undefined"
    @mousedown.prevent
    @click.stop="play"
    @keydown.enter.stop.prevent="play"
    @keydown.space.stop.prevent="play"
    >{{ text }}</span
  >
</template>

<script setup lang="ts">
import { computed, ref } from "vue";

import { useWordAudio } from "~/composables/useWordAudio";
import { isSpeakableWord } from "~/services/wordAudio";

const props = defineProps<{ text: string }>();
const wordEl = ref<HTMLElement>();
const speakable = computed(() => isSpeakableWord(props.text));
const { loadingElement, playWordAudio } = useWordAudio();

function play() {
  if (wordEl.value && speakable.value) void playWordAudio(props.text, wordEl.value);
}
</script>
