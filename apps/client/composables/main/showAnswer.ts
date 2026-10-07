import { useQuestionInput } from "~/components/main/QuestionInput/questionInputHelper";
import { useAnswerTip } from "~/composables/main/answerTip";
import { useGameMode } from "~/composables/main/game";
import { useSummary } from "~/composables/main/summary";
import { useExerciseStore } from "~/store/exercise";

export function useShowAnswer() {
  const courseStore = useExerciseStore();
  const { focusInput } = useQuestionInput();
  const { showQuestion, isAnswer } = useGameMode();
  const { showAnswerTip, hiddenAnswerTip, isAnswerTip } = useAnswerTip();

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

    if (courseStore.canDecomposeCurrentUnit) return;

    if (isAnswerTip()) {
      hiddenAnswerTip();
    } else {
      showAnswerTip();
    }

    // 显示/隐藏答案提示时保持输入焦点，避免移动端键盘收起。
    focusInput();
  }

  return {
    toggleGameMode,
  };
}
