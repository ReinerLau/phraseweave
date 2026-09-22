<template>
  <div class="flex h-full w-full min-w-0 items-center justify-center">
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
