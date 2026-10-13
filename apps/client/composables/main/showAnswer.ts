import { useQuestionInput } from "~/components/main/QuestionInput/questionInputHelper";
import { useGameMode } from "~/composables/main/game";
import { useSummary } from "~/composables/main/summary";

export function useShowAnswer() {
  const { focusInput } = useQuestionInput();
  const { showQuestion, isAnswer } = useGameMode();

  function toggleGameMode() {
    // 重新获取当前面板状态，避免按钮点击时使用过期状态。
    const { showModal } = useSummary();
    if (showModal.value) {
      // 结算面板不做切换处理
      return;
    }

    if (isAnswer()) {
      showQuestion();
      focusInput();
      return;
    }
  }

  return {
    toggleGameMode,
  };
}
