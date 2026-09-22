<template>
  <div class="w-full min-w-0 text-center">
    <div
      class="question-prompt dark:text-gray-50"
      data-testid="question-prompt"
    >
      {{ courseStore.currentStatement?.chinese || "生存还是毁灭，这是一个问题" }}
    </div>
    <MainQuestionInput />
  </div>
</template>

<script setup lang="ts">
import { onMounted, watch } from "vue";

import { useCurrentStatementEnglishSound } from "~/composables/main/englishSound";
import { useAutoPlayEnglish } from "~/composables/user/sound";
import { useExerciseStore } from "~/store/exercise";

const courseStore = useExerciseStore();
const { playSound } = useCurrentStatementEnglishSound();
const { isAutoPlayEnglish } = useAutoPlayEnglish();

onMounted(() => {
  handleAutoPlayEnglish();
});

watch(
  () => courseStore.currentStatement,
  () => {
    handleAutoPlayEnglish();
  },
);

function handleAutoPlayEnglish() {
  if (isAutoPlayEnglish()) {
    playSound();
  }
}
</script>

<style scoped>
.question-prompt {
  margin-bottom: clamp(0.5rem, 2.5vh, 1rem);
  margin-top: clamp(0.5rem, 7vh, 2.5rem);
  font-size: clamp(0.875rem, min(5vw, 4vh), 1.5rem);
  line-height: 1.25;
  overflow-wrap: anywhere;
}
</style>
