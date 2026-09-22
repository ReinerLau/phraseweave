<template>
  <div
    class="flex h-full min-h-0 w-full min-w-0 flex-1 items-center justify-center"
    data-testid="practice-focus-area"
    @click="handleFocusAreaClick"
  >
    <template v-if="currentGameMode === GameMode.Dictation">
      <ModeDictationMode />
    </template>
    <template v-else-if="currentGameMode === GameMode.ChineseToEnglish">
      <ModeChineseToEnglishMode />
    </template>
  </div>

  <MainSummary />
  <MainShare />
  <MainAuthRequired />
</template>

<script setup lang="ts">
import { onMounted } from "vue";

import { useQuestionInput } from "~/components/main/QuestionInput/questionInputHelper";
import { courseTimer } from "~/composables/courses/courseTimer";
import { useGameMode as useQuestionGameMode } from "~/composables/main/game";
import { GameMode, useGameMode } from "~/composables/user/gameMode";

const { currentGameMode } = useGameMode();
const { isQuestion } = useQuestionGameMode();
const { focusInput } = useQuestionInput();

function handleFocusAreaClick() {
  if (isQuestion()) {
    focusInput();
  }
}

onMounted(() => {
  courseTimer.reset();
});
</script>
