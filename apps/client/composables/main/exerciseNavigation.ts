import { onMounted, onUnmounted } from "vue";

import { useGameMode } from "~/composables/main/game";
import { useSummary } from "~/composables/main/summary";
import { useShortcutKeyMode } from "~/composables/user/shortcutKey";
import { useExerciseStore } from "~/store/exercise";
import { cancelShortcut, registerShortcut } from "~/utils/keyboardShortcuts";

export function useExerciseNavigation() {
  const courseStore = useExerciseStore();
  const { showQuestion } = useGameMode();
  const { showSummary } = useSummary();

  function goToNextQuestion() {
    if (courseStore.isAllDone()) {
      showSummary();
      return;
    }

    courseStore.toNextStatement();
    showQuestion();
  }

  function goToPreviousQuestion() {
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
