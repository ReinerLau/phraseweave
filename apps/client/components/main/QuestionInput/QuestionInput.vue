<template>
  <div
    class="question-input-shell text-center"
    :style="{ '--question-input-viewport-offset': `${inputViewportOffset}px` }"
  >
    <div
      class="question-input-words relative flex w-full min-w-0 max-w-full flex-wrap justify-center gap-2 transition-all"
      :style="questionInputStyle"
    >
      <template
        v-for="(w, i) in courseStore.words"
        :key="i"
      >
        <div
          class="question-input-word min-h-[4rem] min-w-0 max-w-full rounded-[2px] border-b-2 border-solid leading-none transition-all"
          :class="getWordsClassNames(i)"
          :style="{ width: `${inputWidth(w)}ch` }"
        >
          {{ userInputWords[i]["userInput"] }}
        </div>
      </template>
      <input
        ref="inputEl"
        class="absolute h-full w-full opacity-0"
        type="text"
        v-model="inputValue"
        @keydown="handleKeydown"
        @focus="handleInputFocus"
        @blur="handleInputBlur"
        @dblclick.prevent
        @mousedown="preventCursorMove"
        @compositionstart="handleCompositionStart"
        @compositionend="handleCompositionEnd"
        autoFocus
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";

import { courseTimer } from "~/composables/courses/courseTimer";
import { useAnswerTip } from "~/composables/main/answerTip";
import { useGameMode } from "~/composables/main/game";
import { useInput } from "~/composables/main/question";
import { useSummary } from "~/composables/main/summary";
import { useAutoNextQuestion } from "~/composables/user/autoNext";
import { useErrorTip } from "~/composables/user/errorTip";
import { useKeyboardSound } from "~/composables/user/sound";
import { useSpaceSubmitAnswer } from "~/composables/user/submitKey";
import { useShowWordsWidth } from "~/composables/user/words";
import { useExerciseStore } from "~/store/exercise";
import {
  getQuestionInputScrollOffset,
  getQuestionInputStyle,
  getWordWidth,
  useQuestionInput,
} from "./questionInputHelper";
import { usePlayTipSound, useTypingSound } from "./useTypingSound";

const courseStore = useExerciseStore();
const questionInputStyle = computed(() => getQuestionInputStyle(courseStore.words));
const { inputEl, focusing, focusInput, blurInput, setInputCursorPosition, getInputCursorPosition } =
  useQuestionInput();

const { showAnswer } = useGameMode();
const { showSummary } = useSummary();
const { isShowWordsWidth } = useShowWordsWidth();
const { isUseSpaceSubmitAnswer } = useSpaceSubmitAnswer();
const { isKeyboardSoundEnabled } = useKeyboardSound();
const { checkPlayTypingSound, playTypingSound } = useTypingSound();
const { playRightSound, playErrorSound } = usePlayTipSound();
const { handleAnswerError, resetCloseTip } = answerError();
const { isAutoNextQuestion } = useAutoNextQuestion();
const { isShowErrorTip } = useErrorTip();

const { inputValue, userInputWords, submitAnswer, setInputValue, handleKeyboardInput } = useInput({
  source: () => courseStore.currentStatement?.english!,
  setInputCursorPosition,
  getInputCursorPosition,
  inputChangedCallback,
});
const { showAnswerTip, hiddenAnswerTip } = useAnswerTip();

const inputViewportOffset = ref(0);
let inputVisibilityFrame: number | undefined;
let inputVisibilityTimeout: number | undefined;

function ensureInputVisible() {
  const input = inputEl.value;
  if (!input) return;

  const viewport = window.visualViewport;
  const viewportHeight = viewport?.height ?? window.innerHeight;
  const viewportOffsetTop = viewport?.offsetTop ?? 0;

  const rect = input.getBoundingClientRect();
  inputViewportOffset.value = getQuestionInputScrollOffset(rect, viewportHeight, viewportOffsetTop);
}

function scheduleInputVisibilityCheck() {
  if (inputVisibilityFrame !== undefined) {
    window.cancelAnimationFrame(inputVisibilityFrame);
  }

  inputVisibilityFrame = window.requestAnimationFrame(() => {
    inputVisibilityFrame = undefined;
    ensureInputVisible();
  });
}

function handleInputFocus() {
  focusInput();
  scheduleInputVisibilityCheck();

  if (inputVisibilityTimeout !== undefined) {
    window.clearTimeout(inputVisibilityTimeout);
  }
  inputVisibilityTimeout = window.setTimeout(scheduleInputVisibilityCheck, 300);
}

function handleInputBlur() {
  blurInput();
  inputViewportOffset.value = 0;
}

function handleViewportResize() {
  if (focusing.value) {
    scheduleInputVisibilityCheck();
  } else {
    inputViewportOffset.value = 0;
  }
}

onMounted(() => {
  const viewport = window.visualViewport;
  viewport?.addEventListener("resize", handleViewportResize);
  viewport?.addEventListener("scroll", handleViewportResize);
  window.addEventListener("resize", handleViewportResize);
  focusInput();
  resetCloseTip();
});

onUnmounted(() => {
  const viewport = window.visualViewport;
  viewport?.removeEventListener("resize", handleViewportResize);
  viewport?.removeEventListener("scroll", handleViewportResize);
  window.removeEventListener("resize", handleViewportResize);
  if (inputVisibilityFrame !== undefined) {
    window.cancelAnimationFrame(inputVisibilityFrame);
  }
  if (inputVisibilityTimeout !== undefined) {
    window.clearTimeout(inputVisibilityTimeout);
  }
});

focusInputWhenWIndowFocus();

watch(
  () => inputValue.value,
  (val) => {
    setInputValue(val);
    courseTimer.time(String(courseStore.statementIndex));
  },
);

watch(
  () => courseStore.statementIndex,
  () => {
    focusInput();
    scheduleInputVisibilityCheck();
    resetCloseTip();
  },
);

function focusInputWhenWIndowFocus() {
  const handleFocus = () => {
    focusInput();
    scheduleInputVisibilityCheck();
  };

  onMounted(() => {
    window.addEventListener("focus", handleFocus);
  });

  onUnmounted(() => {
    window.removeEventListener("focus", handleFocus);
  });
}

function getWordsClassNames(index: number) {
  const word = userInputWords[index];
  // 当前单词激活 且 聚焦
  if (word.isActive && focusing.value) {
    return "text-fuchsia-500 border-b-fuchsia-500";
  }

  // 当前单词错误 且 聚焦
  if (word.incorrect && focusing.value) {
    return "text-red-500 border-b-red-500";
  }

  // 默认样式
  return "text-[#20202099] border-b-gray-300 dark:text-gray-300 dark:border-b-gray-400";
}

function inputChangedCallback(e: KeyboardEvent) {
  if (isKeyboardSoundEnabled() && checkPlayTypingSound(e)) {
    playTypingSound();
  }
}

// 输入宽度
function inputWidth(word: string) {
  if (!isShowWordsWidth()) {
    // 不显示对应单词宽度，默认 4 字符宽度
    return 4;
  }

  return getWordWidth(word);
}

function answerError() {
  let wrongTimes = 0;

  function handleAnswerError() {
    playErrorSound();
    wrongTimes++;
    if (isShowErrorTip() && wrongTimes >= 3) {
      showAnswerTip();
    }
  }

  function resetCloseTip() {
    wrongTimes = 0;
    hiddenAnswerTip();
  }

  return {
    handleAnswerError,
    resetCloseTip,
  };
}

function handleAnswerRight() {
  courseTimer.timeEnd(String(courseStore.statementIndex)); // 停止当前题目的计时
  playRightSound();

  if (isAutoNextQuestion()) {
    // 自动下一题
    if (courseStore.isAllDone()) {
      blurInput(); // 失去输入焦点，防止结束时光标仍然在输入框，造成后续结算面板回车事件无法触发
      showSummary();
    }
    courseStore.toNextStatement();
  } else {
    showAnswer();
  }
}

// 中文输入会导致先触发 handleKeydown
// 但是这时候字符还没有上屏
// 就会造成触发 submit answer  导致明明答案正确但是不通过的问题
// 通过检测是否为输入法 来避免按下 enter 后直接触发 submit answer
let isComposing = ref(false);
function handleCompositionStart() {
  isComposing.value = true;
}

function handleCompositionEnd() {
  isComposing.value = false;
}

function handleKeydown(e: KeyboardEvent) {
  // 避免在某些中文输入法中，按下 Ctrl 键时，输入法会将当前的预输入字符上屏
  if (e.ctrlKey) {
    e.preventDefault();
    return;
  }

  if (e.code === "Enter" && !isComposing.value) {
    e.stopPropagation();
    submitAnswer(handleAnswerRight, handleAnswerError);
    return;
  }

  handleKeyboardInput(e, {
    useSpaceSubmitAnswer: {
      enable: isUseSpaceSubmitAnswer(),
      rightCallback: handleAnswerRight,
      errorCallback: handleAnswerError,
    },
  });
}

function preventCursorMove(event: MouseEvent) {
  // 阻止 mousedown 事件的默认行为
  // 它会改变 input 光标的位置
  event.preventDefault();
  // 只允许 input focus
  focusInput();
}
</script>

<style scoped>
.question-input-shell {
  container-type: inline-size;
  width: 100%;
  min-width: 0;
  max-width: 100%;
  max-height: min(60vh, 32rem);
  overflow-x: hidden;
  overflow-y: auto;
  padding-inline: 1rem;
  transform: translateY(calc(var(--question-input-viewport-offset, 0px) * -1));
}

.question-input-words {
  font-size: var(--question-max-font-size);
  font-size: clamp(
    var(--question-min-font-size),
    var(--question-fluid-font-size),
    var(--question-max-font-size)
  );
}

.question-input-word {
  overflow-wrap: anywhere;
}
</style>
