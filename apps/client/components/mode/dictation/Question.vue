<template>
  <div>
    <MainQuestionInput />
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, watch } from "vue";

import { useExerciseStore } from "~/store/exercise";
import { play } from "./dictation";

usePlayEnglishSound();

function usePlayEnglishSound() {
  onMounted(() => {
    const pauseSound = play();
    const courseStore = useExerciseStore();

    watch(
      () => courseStore.statementIndex,
      () => {
        pauseSound();
        play();
      },
    );

    onUnmounted(() => {
      pauseSound();
    });
  });
}
</script>
