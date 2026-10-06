<template>
  <div class="flex min-w-0 flex-col gap-1">
    <select
      class="select select-bordered select-sm min-h-11 w-full min-w-0 max-w-56 text-sm"
      aria-label="学习方向"
      :value="courseStore.learningMode"
      :disabled="showModal"
      @change="changeMode"
      @keydown.stop
    >
      <option value="progressive">从简单到复杂</option>
      <option
        value="sentence-first"
        :disabled="!courseStore.canUseSentenceFirst"
      >
        从复杂回退到简单
      </option>
    </select>
    <span
      v-if="!courseStore.canUseSentenceFirst"
      class="max-w-56 text-xs opacity-70"
    >
      该练习无法识别原句分组，请重新生成以使用复杂模式。
    </span>
  </div>
</template>

<script setup lang="ts">
import { nextTick } from "vue";

import type { LearningMode } from "~/utils/learningDirection";
import { useQuestionInput } from "~/components/main/QuestionInput/questionInputHelper";
import { courseTimer } from "~/composables/courses/courseTimer";
import { useAnswerTip } from "~/composables/main/answerTip";
import { useGameMode } from "~/composables/main/game";
import { clearQuestionInput } from "~/composables/main/question";
import { useSummary } from "~/composables/main/summary";
import { useExerciseStore } from "~/store/exercise";

const courseStore = useExerciseStore();
const { focusInput } = useQuestionInput();
const { hiddenAnswerTip } = useAnswerTip();
const { showQuestion } = useGameMode();
const { showModal } = useSummary();

async function changeMode(event: Event) {
  const select = event.target as HTMLSelectElement;
  const mode = select.value as LearningMode;
  const previousTimerLabel = String(courseStore.statementIndex);
  if (!courseStore.switchLearningMode(mode)) {
    select.value = courseStore.learningMode;
    return;
  }
  hiddenAnswerTip();
  clearQuestionInput();
  showQuestion();
  courseTimer.resetQuestion(previousTimerLabel);
  courseTimer.resetQuestion(String(courseStore.statementIndex));
  await nextTick();
  focusInput();
}
</script>
