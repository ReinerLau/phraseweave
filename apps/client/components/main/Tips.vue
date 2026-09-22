<template>
  <div
    class="relative flex min-h-10 w-full items-stretch justify-start gap-2 py-1"
    data-testid="practice-tips"
  >
    <button
      class="btn btn-outline btn-sm min-w-0 flex-1"
      data-testid="show-answer-button"
      @click="toggleGameMode"
    >
      {{ answerTipText }}
    </button>
    <button
      class="btn btn-outline btn-sm min-w-0 flex-1"
      data-testid="next-question-button"
      @click="goToNextQuestion"
    >
      下一题
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted } from "vue";

import { useQuestionInput } from "~/components/main/QuestionInput/questionInputHelper";
import { useAnswerTip } from "~/composables/main/answerTip";
import { useCurrentStatementEnglishSound } from "~/composables/main/englishSound";
import {
  useExerciseNavigation,
  useExerciseNavigationShortcuts,
} from "~/composables/main/exerciseNavigation";
import { useGameMode } from "~/composables/main/game";
import { useSummary } from "~/composables/main/summary";
import { useShortcutKeyMode } from "~/composables/user/shortcutKey";
import { cancelShortcut, registerShortcut } from "~/utils/keyboardShortcuts";

const { shortcutKeys } = useShortcutKeyMode();
usePlaySound(shortcutKeys.value.sound);
const { toggleGameMode } = useShowAnswer();
const { goToNextQuestion } = useExerciseNavigation();
useExerciseNavigationShortcuts();

const answerTipText = computed(() => {
  let text = "";
  const { isAnswer } = useGameMode();
  const { isAnswerTip } = useAnswerTip();
  if (isAnswer()) {
    text = "再来一次";
  } else {
    if (isAnswerTip()) {
      text = "隐藏答案";
    } else {
      text = "显示答案";
    }
  }
  return text;
});

function usePlaySound(key: string) {
  const { playSound } = useCurrentStatementEnglishSound();

  onMounted(() => {
    registerShortcut(key, playSoundCommand);
  });

  onUnmounted(() => {
    cancelShortcut(key, playSoundCommand);
  });

  function playSoundCommand(e: KeyboardEvent) {
    e.preventDefault();
    playSound();
  }
}

function useShowAnswer() {
  const { focusInput, blurInput } = useQuestionInput();
  const { showQuestion } = useGameMode();
  const { showAnswerTip, hiddenAnswerTip } = useAnswerTip();

  function toggleGameMode() {
    // 重新获取当前面板状态，避免按钮点击时使用过期状态。
    const { showModal } = useSummary();
    if (showModal.value) {
      // 结算面板不做切换处理
      return;
    }

    const { isAnswer } = useGameMode();
    const { isAnswerTip } = useAnswerTip();
    if (isAnswer()) {
      showQuestion();
      focusInput();
    } else {
      if (isAnswerTip()) {
        hiddenAnswerTip();
      } else {
        showAnswerTip();
      }
      blurInput();
    }
  }

  return {
    toggleGameMode,
  };
}
</script>
