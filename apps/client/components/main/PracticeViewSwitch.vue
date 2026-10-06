<template>
  <div class="flex min-w-0 flex-col gap-1">
    <select
      class="select select-bordered select-sm min-h-11 w-full min-w-0 text-sm"
      aria-label="展示方式"
      :value="courseStore.practiceView"
      :disabled="showModal"
      @change="changeView"
      @keydown.stop
    >
      <option value="single">单题</option>
      <option
        value="fulltext"
        :disabled="!courseStore.canUseFulltext"
      >
        全文
      </option>
    </select>
    <span
      v-if="!courseStore.canUseFulltext"
      class="text-xs opacity-70"
    >
      该练习无法识别原句，请重新生成以使用全文模式。
    </span>
  </div>
</template>

<script setup lang="ts">
import { nextTick } from "vue";

import type { PracticeView } from "~/store/exercise";
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

async function changeView(event: Event) {
  const select = event.target as HTMLSelectElement;
  if (!courseStore.switchPracticeView(select.value as PracticeView)) {
    select.value = courseStore.practiceView;
    return;
  }
  hiddenAnswerTip();
  clearQuestionInput();
  showQuestion();
  courseTimer.resetQuestion(String(courseStore.statementIndex));
  await nextTick();
  focusInput();
}
</script>
