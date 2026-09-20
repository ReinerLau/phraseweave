<template>
  <div class="w-full min-w-0 text-center">
    <div class="mb-4 mt-10 text-2xl dark:text-gray-50">
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
