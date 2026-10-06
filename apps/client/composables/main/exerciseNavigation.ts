import { onMounted, onUnmounted } from "vue";

import { useGameMode } from "~/composables/main/game";
import { useSummary } from "~/composables/main/summary";
import { useShortcutKeyMode } from "~/composables/user/shortcutKey";
import { useExerciseStore } from "~/store/exercise";
import { cancelShortcut, registerShortcut } from "~/utils/keyboardShortcuts";

export function useExerciseNavigation() {
  const courseStore = useExerciseStore();
  const { showQuestion, isAnswer } = useGameMode();
  const { showSummary, showModal } = useSummary();

  function goToNextQuestion() {
    if (showModal.value || (courseStore.isFulltext && !isAnswer())) return;
    if (isAnswer() ? courseStore.advanceAfterCorrect() : courseStore.isAllDone()) {
      courseStore.cancelRecovery();
      showSummary();
      return;
    }

    if (!isAnswer()) courseStore.toNextStatement();
    showQuestion();
  }

  function goToPreviousQuestion() {
    if (showModal.value || courseStore.isFulltext) return;
    courseStore.toPreviousStatement();
    showQuestion();
  }

  return {
    goToNextQuestion,
    goToPreviousQuestion,
  };
}

export function useExerciseNavigationShortcuts() {
  const { shortcutKeys } = useShortcutKeyMode();
  const { goToNextQuestion, goToPreviousQuestion } = useExerciseNavigation();

  onMounted(() => {
    registerShortcut(shortcutKeys.value.previous, goToPreviousQuestion);
    registerShortcut(shortcutKeys.value.skip, goToNextQuestion);
  });

  onUnmounted(() => {
    cancelShortcut(shortcutKeys.value.previous, goToPreviousQuestion);
    cancelShortcut(shortcutKeys.value.skip, goToNextQuestion);
  });
}
