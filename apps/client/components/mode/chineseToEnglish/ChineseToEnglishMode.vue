<template>
  <div
    class="flex h-full min-h-0 w-full min-w-0 flex-col items-start justify-start overflow-hidden"
  >
    <template v-if="isQuestion()">
      <ModeChineseToEnglishQuestion />
    </template>
    <template v-else-if="isAnswer()">
      <MainAnswer />
    </template>
  </div>
</template>

<script setup lang="ts">
import { useGameMode } from "~/composables/main/game";

const { isAnswer, isQuestion } = useGameMode();
</script>
