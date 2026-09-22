<template>
  <div class="question-input-shell">
    <div
      ref="questionInputWordsEl"
      class="question-input-words relative flex w-full min-w-0 max-w-full flex-wrap justify-start gap-2 text-left"
    >
      <template
        v-for="(w, i) in courseStore.words"
        :key="i"
      >
        <div
          class="question-input-word min-w-0 max-w-full rounded-[2px] border-b-2 border-solid leading-none"
          :class="getWordsClassNames(i)"
          :style="{ width: `${inputWidth(w)}ch` }"
        >
          {{ isAnswerTip() ? w : userInputWords[i]["userInput"] }}
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
      <span
        ref="questionInputChProbeEl"
        class="pointer-events-none absolute h-0 w-[1ch] opacity-0"
        aria-hidden="true"
      ></span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from "vue";

import { courseTimer } from "~/composables/courses/courseTimer";
import { useAnswerTip } from "~/composables/main/answerTip";
import { useGameMode } from "~/composables/main/game";
import { containsLatinLetter, sanitizeQuestionInput, useInput } from "~/composables/main/question";
import { useSummary } from "~/composables/main/summary";
import { useAutoNextQuestion } from "~/composables/user/autoNext";
import { useKeyboardSound } from "~/composables/user/sound";
import { useSpaceSubmitAnswer } from "~/composables/user/submitKey";
import { useShowWordsWidth } from "~/composables/user/words";
import { useExerciseStore } from "~/store/exercise";
import { getWordWidth, useQuestionInput } from "./questionInputHelper";
import { usePlayTipSound, useTypingSound } from "./useTypingSound";

const courseStore = useExerciseStore();
const { inputEl, focusing, focusInput, blurInput, setInputCursorPosition, getInputCursorPosition } =
  useQuestionInput();

const { showAnswer } = useGameMode();
const { showSummary } = useSummary();
const { isShowWordsWidth } = useShowWordsWidth();
const { isUseSpaceSubmitAnswer } = useSpaceSubmitAnswer();
const { isKeyboardSoundEnabled } = useKeyboardSound();
const { checkPlayTypingSound, playTypingSound } = useTypingSound();
const { playRightSound, playErrorSound } = usePlayTipSound();
const { isAutoNextQuestion } = useAutoNextQuestion();
const questionInputWordsEl = ref<HTMLElement>();
const questionInputChProbeEl = ref<HTMLElement>();
const ERROR_FEEDBACK_DURATION_MS = 300;
let errorResetTimer: ReturnType<typeof setTimeout> | undefined;

const { inputValue, userInputWords, submitAnswer, setInputValue, clearInput, handleKeyboardInput } =
  useInput({
    source: () => courseStore.currentStatement?.english!,
    setInputCursorPosition,
    getInputCursorPosition,
    inputChangedCallback,
    getInputWordWidth,
    getInputWordCapacity,
  });
const { hiddenAnswerTip, isAnswerTip } = useAnswerTip();

function handleInputFocus() {
  focusInput();
}

function handleInputBlur() {
  blurInput();
}

onMounted(() => {
  focusInput();
});

focusInputWhenWIndowFocus();
onUnmounted(cancelErrorReset);

watch(
  () => inputValue.value,
  (val) => {
    const sanitizedValue = sanitizeQuestionInput(val);
    if (isAnswerTip() && containsLatinLetter(sanitizedValue)) {
      hiddenAnswerTip();
    }

    setInputValue(sanitizedValue);
    if (!isAnswerTip()) {
      courseTimer.time(String(courseStore.statementIndex));
    }
  },
);

watch(isAnswerTip, (isVisible) => {
  if (isVisible) {
    clearInput();
  }
});

watch(
  () => courseStore.statementIndex,
  () => {
    focusInput();
  },
);

function focusInputWhenWIndowFocus() {
  const handleFocus = () => {
    focusInput();
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

  // 答案提示文字使用占位符样式，但聚焦时仍高亮当前输入位置。
  if (isAnswerTip()) {
    if (word.isActive && focusing.value) {
      return "text-gray-400 border-b-fuchsia-500 dark:text-gray-500 dark:border-b-fuchsia-500";
    }

    return "text-gray-400 border-b-gray-300 dark:text-gray-500 dark:border-b-gray-400";
  }

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

function getInputWordWidth(word: string) {
  return Math.max(0, getWordWidth(word) - 1);
}

function getInputWordCapacity(word: string) {
  const blockCapacity = isShowWordsWidth() ? getInputWordWidth(word) : 4;
  const wordsEl = questionInputWordsEl.value;
  const chProbeEl = questionInputChProbeEl.value;

  if (!wordsEl || !chProbeEl) return blockCapacity;

  const chWidth = chProbeEl.getBoundingClientRect().width;
  if (chWidth <= 0) return blockCapacity;

  const containerWidthInCh = wordsEl.clientWidth / chWidth;
  const blockWidth = inputWidth(word);
  const availableBlockWidth = Math.min(blockWidth, containerWidthInCh);

  return isShowWordsWidth()
    ? Math.max(0, Math.min(blockCapacity, availableBlockWidth - 1))
    : Math.max(0, Math.min(blockCapacity, availableBlockWidth));
}

function cancelErrorReset() {
  if (errorResetTimer === undefined) return;

  clearTimeout(errorResetTimer);
  errorResetTimer = undefined;
}

function handleAnswerError() {
  playErrorSound();
  cancelErrorReset();
  errorResetTimer = setTimeout(() => {
    errorResetTimer = undefined;
    clearInput();
  }, ERROR_FEEDBACK_DURATION_MS);
}

function handleAnswerRight() {
  cancelErrorReset();
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
  if (e.ctrlKey) {
    e.preventDefault();
    return;
  }

  if (isAnswerTip()) {
    const isLatinLetterKey = /^[A-Za-z]$/.test(e.key) && !e.metaKey && !e.altKey;
    if (isLatinLetterKey) {
      hiddenAnswerTip();
    } else {
      if (e.code === "Enter") {
        e.preventDefault();
        e.stopPropagation();
      } else if (e.code.startsWith("Arrow")) {
        handleKeyboardInput(e);
      }
      return;
    }
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
  width: 100%;
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
}

.question-input-words {
  gap: clamp(0.25rem, min(2vw, 1dvh), 0.5rem);
  font-size: inherit;
}

.question-input-word {
  min-height: 1em;
  overflow-wrap: anywhere;
  white-space: normal;
}
</style>
