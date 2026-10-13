<template>
  <div
    class="question-input-shell"
    :class="{ inline }"
  >
    <div
      ref="questionInputWordsEl"
      class="question-input-words relative flex min-w-0 max-w-full flex-wrap items-start justify-start text-left"
      :class="inline ? 'w-fit' : 'w-full'"
      :style="{ '--question-word-gap': `${measureEm(' ')}em` }"
      @pointermove="handleWordHover"
      @pointerleave="clearWordHover"
    >
      <ClozeText :tokens="courseStore.clozeTokens">
        <template #word="{ token }">
          <span
            class="question-input-word min-w-0 max-w-full rounded-[2px] border-b-2 border-solid leading-none"
            :class="[
              getWordsClassNames(token.wordIndex),
              {
                'fixed-underline': isWordSpaceCheckEnabled(),
                'speech-word': isSpeakableWord(displayedWord(token.wordIndex, token.text)),
                'speech-hover': hoveredWordIndex === token.wordIndex,
                'speech-loading':
                  loadingElement?.dataset.wordIndex === String(token.wordIndex) &&
                  questionInputWordsEl?.contains(loadingElement),
              },
            ]"
            :data-word-index="token.wordIndex"
            :data-speech-text="displayedWord(token.wordIndex, token.text)"
            :title="
              isSpeakableWord(displayedWord(token.wordIndex, token.text))
                ? `朗读 ${displayedWord(token.wordIndex, token.text)}`
                : undefined
            "
            :aria-busy="
              (loadingElement?.dataset.wordIndex === String(token.wordIndex) &&
                questionInputWordsEl?.contains(loadingElement)) ||
              undefined
            "
            :style="{
              width: `${inputWidth(token.wordIndex)}em`,
              '--word-underline-width': `${wordWidth(token.text)}em`,
            }"
          >
            {{ displayedWord(token.wordIndex, token.text) }}
          </span>
        </template>
      </ClozeText>
      <input
        ref="inputEl"
        class="absolute h-full w-full opacity-0"
        :class="{ 'cursor-pointer': hoveredWordIndex !== undefined }"
        type="text"
        aria-label="填写当前英文单元"
        :maxlength="inputMaxLength"
        v-model="inputValue"
        @keydown="handleKeydown"
        @beforeinput="handleBeforeInput"
        @focus="handleInputFocus"
        @blur="handleInputBlur"
        @dblclick.prevent
        @mousedown="preventCursorMove"
        @click="handleWordClick"
        @compositionstart="handleCompositionStart"
        @compositionend="handleCompositionEnd"
        autoFocus
      />
      <!-- 隐藏探针：用真实渲染字体测量文本宽度和当前字号 -->
      <span
        ref="questionInputProbeEl"
        class="pointer-events-none absolute h-0 w-max whitespace-pre opacity-0"
        aria-hidden="true"
      ></span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";

import { courseTimer } from "~/composables/courses/courseTimer";
import { useAnswerTip } from "~/composables/main/answerTip";
import { useGameMode } from "~/composables/main/game";
import {
  containsAllowedQuestionCharacter,
  sanitizeQuestionInput,
  useInput,
} from "~/composables/main/question";
import { useSummary } from "~/composables/main/summary";
import { useAutoNextQuestion } from "~/composables/user/autoNext";
import { useKeyboardSound } from "~/composables/user/sound";
import { useSpaceSubmitAnswer } from "~/composables/user/submitKey";
import { useWordSpaceCheck } from "~/composables/user/wordSpaceCheck";
import { findWordUnderInput, playWordUnderInput, useWordAudio } from "~/composables/useWordAudio";
import { lookupPronunciation } from "~/services/pronunciation";
import { isSpeakableWord } from "~/services/wordAudio";
import { useExerciseStore } from "~/store/exercise";
import ClozeText from "./ClozeText.vue";
import {
  getInputWordWidthEm,
  getWordBlockWidthEm,
  getWordCapacityEm,
  useQuestionInput,
  useWordWidths,
} from "./questionInputHelper";
import { useCorrectSound } from "./useCorrectSound";
import { useTypingSound } from "./useTypingSound";

defineProps<{ inline?: boolean }>();
const emit = defineEmits<{ "hint-change": [syllables: string[] | undefined] }>();
let hintSequence = 0;

const courseStore = useExerciseStore();
const { loadingElement } = useWordAudio();
const { inputEl, focusing, focusInput, blurInput, setInputCursorPosition, getInputCursorPosition } =
  useQuestionInput();

const { showAnswer } = useGameMode();
const { showSummary } = useSummary();
const { isUseSpaceSubmitAnswer } = useSpaceSubmitAnswer();
const { wordSpaceCheck, isWordSpaceCheckEnabled } = useWordSpaceCheck();
const { isKeyboardSoundEnabled } = useKeyboardSound();
const { checkPlayTypingSound, playTypingSound } = useTypingSound();
const { playCorrectSound } = useCorrectSound();
const { isAutoNextQuestion } = useAutoNextQuestion();
const questionInputWordsEl = ref<HTMLElement>();
const hoveredWordIndex = ref<number>();
let hoverPoint: Pick<MouseEvent, "clientX" | "clientY"> | undefined;
// 共享的词块宽度测量（探针、失效重测、字号变化重测），与答案区同源
const { probeEl: questionInputProbeEl, measureEm, wordWidth } = useWordWidths(questionInputWordsEl);

const ERROR_FEEDBACK_DURATION_MS = 300;
let errorResetTimer: ReturnType<typeof setTimeout> | undefined;
let wordFeedbackTimer: ReturnType<typeof setTimeout> | undefined;

const {
  inputValue,
  userInputWords,
  submitAnswer,
  setInputValue,
  clearInput,
  handleKeyboardInput,
  confirmCurrentWord,
  clearWordFeedback,
  getWordHelpRequest,
} = useInput({
  source: () => courseStore.currentStatement?.english ?? "",
  setInputCursorPosition,
  getInputCursorPosition,
  inputChangedCallback,
  getInputWordWidth,
  getInputWordCapacity,
  isWordSpaceCheckEnabled,
});
const { hiddenAnswerTip, isAnswerTip } = useAnswerTip();
const inputMaxLength = computed(() =>
  isWordSpaceCheckEnabled()
    ? userInputWords.find((word) => word.isActive)?.text.length ?? 0
    : undefined,
);

// Re-check after visible text changes, even when the pointer stays still.
watch(() => [inputValue.value, isAnswerTip()], refreshWordHover, { flush: "post" });

function inputChangedCallback(event: KeyboardEvent) {
  if (isKeyboardSoundEnabled() && checkPlayTypingSound(event)) {
    void playTypingSound();
  }
}

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
onUnmounted(() => {
  cancelErrorReset();
  cancelWordFeedback();
  clearPhoneticHint();
  clearInput();
});

function clearPhoneticHint() {
  hintSequence++;
  emit("hint-change", undefined);
}

async function showPhoneticHint() {
  if (courseStore.canDecomposeCurrentUnit || courseStore.words.length !== 1) return;
  const word = courseStore.words[0];
  if (!isSpeakableWord(word)) return;
  const request = ++hintSequence;
  try {
    const syllables = await lookupPronunciation(word);
    if (request !== hintSequence) return;
    emit("hint-change", syllables);
  } catch {
    // A missing resource never interrupts answering or error recovery.
  }
}

watch(
  () => inputValue.value,
  (val) => {
    if (isWordSpaceCheckEnabled()) cancelWordFeedback();
    const sanitizedValue = sanitizeQuestionInput(val);
    if (isAnswerTip() && containsAllowedQuestionCharacter(sanitizedValue)) {
      hiddenAnswerTip();
    }

    setInputValue(sanitizedValue);
    if (!isAnswerTip() && sanitizedValue.length > 0) {
      courseTimer.time(String(courseStore.statementIndex));
    }
  },
);

watch(isAnswerTip, (isVisible) => {
  if (isVisible) {
    cancelErrorReset();
    cancelWordFeedback();
    clearPhoneticHint();
    clearInput();
  }
});

watch(
  () => [
    courseStore.currentStatement?.id,
    courseStore.statementIndex,
    courseStore.currentCourse?.id,
    courseStore.learningMode,
    courseStore.practiceView,
    wordSpaceCheck.value,
  ],
  () => {
    cancelErrorReset();
    cancelWordFeedback();
    clearPhoneticHint();
    clearWordHover();
    clearInput();
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

  if (word.confirmed) {
    return "text-[#202020] border-b-transparent dark:text-gray-50";
  }

  if (isWordSpaceCheckEnabled() && word.incorrect) {
    return "text-red-500 border-b-red-500";
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

// 词块容纳当前草稿；实验模式的下划线单独按目标词元宽度绘制。
function inputWidth(index: number) {
  const targetWord = courseStore.words[index] ?? "";
  const typedWord = isAnswerTip() ? "" : userInputWords[index]?.userInput ?? "";

  return getWordBlockWidthEm(measureEm(targetWord), measureEm(typedWord));
}

// 已输入文本的实测宽度，单位 em
function getInputWordWidth(text: string) {
  return getInputWordWidthEm(text, measureEm);
}

// 输入容量由目标单词决定；行内剩余宽度不应限制答案字符数。
function getInputWordCapacity(word: string) {
  return getWordCapacityEm(getInputWordWidth(word));
}

function cancelErrorReset() {
  if (errorResetTimer === undefined) return;

  clearTimeout(errorResetTimer);
  errorResetTimer = undefined;
}

function cancelWordFeedback() {
  if (wordFeedbackTimer !== undefined) clearTimeout(wordFeedbackTimer);
  wordFeedbackTimer = undefined;
  clearWordFeedback();
}

function handleWordConfirmation(unmatchedAction: "feedback" | "help" = "feedback") {
  if (isAnswerTip() || !userInputWords.some((word) => word.isActive)) return;
  cancelWordFeedback();
  setInputValue(inputEl.value?.value ?? inputValue.value);
  const result = confirmCurrentWord();
  if (result === "unmatched") {
    if (unmatchedAction === "help") handleWordHelp();
    else wordFeedbackTimer = setTimeout(cancelWordFeedback, ERROR_FEEDBACK_DURATION_MS);
  } else if (result === "confirmed" || result === "complete") {
    void playCorrectSound();
    if (result === "complete") handleAnswerRight();
  }
}

function handleWordHelp() {
  const request = getWordHelpRequest();
  if (!request) return;
  cancelWordFeedback();
  cancelErrorReset();
  void showPhoneticHint();
  clearInput();
  courseStore.failCurrentStatement(request.input, request.lastWordIndex);
}

// Soft keyboards can insert a space without dispatching a keydown event.
function handleBeforeInput(event: Event) {
  const inputEvent = event as InputEvent;
  if (!isWordSpaceCheckEnabled() || isComposing.value || inputEvent.isComposing) return;
  if (inputEvent.inputType === "insertText" && inputEvent.data === " ") {
    event.preventDefault();
    handleWordConfirmation();
  }
}

function handleAnswerError(submittedInput: string, lastWordIndex: number) {
  cancelErrorReset();
  errorResetTimer = setTimeout(() => {
    errorResetTimer = undefined;
    void showPhoneticHint();
    clearInput();
    courseStore.failCurrentStatement(submittedInput, lastWordIndex);
  }, ERROR_FEEDBACK_DURATION_MS);
}

function handleAnswerRight() {
  cancelErrorReset();
  cancelWordFeedback();
  clearPhoneticHint();
  courseStore.passCurrentStatement();
  if (courseStore.isAnsweringBaseUnit) {
    courseTimer.timeEnd(String(courseStore.statementIndex)); // 回退题计入原题耗时
  }

  if (isAutoNextQuestion()) {
    const completed = courseStore.advanceAfterCorrect();
    if (completed) {
      blurInput(); // 失去输入焦点，防止结束时光标仍然在输入框，造成后续结算面板回车事件无法触发
      showSummary();
    }
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
  if (isWordSpaceCheckEnabled() && (isComposing.value || e.isComposing || e.keyCode === 229)) {
    return;
  }
  if (e.ctrlKey) {
    e.preventDefault();
    return;
  }

  if (isAnswerTip()) {
    const isAllowedCharacterKey =
      [...e.key].length === 1 && containsAllowedQuestionCharacter(e.key) && !e.metaKey && !e.altKey;
    if (isAllowedCharacterKey) {
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

  if (isWordSpaceCheckEnabled() && (e.code === "Space" || e.code === "Enter")) {
    e.preventDefault();
    e.stopPropagation();
    if (e.repeat) return;
    handleWordConfirmation(e.code === "Enter" ? "help" : "feedback");
    return;
  }

  if (e.code === "Enter" && !isComposing.value) {
    e.preventDefault();
    e.stopPropagation();
    if (submitAnswer(handleAnswerRight, handleAnswerError) === "continue") cancelErrorReset();
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

function displayedWord(index: number, target: string) {
  return isAnswerTip() ? target : userInputWords[index]?.userInput ?? "";
}

function handleWordClick(event: MouseEvent) {
  if (questionInputWordsEl.value) playWordUnderInput(event, questionInputWordsEl.value);
}

function refreshWordHover() {
  const word =
    hoverPoint && questionInputWordsEl.value
      ? findWordUnderInput(hoverPoint, questionInputWordsEl.value)
      : undefined;
  hoveredWordIndex.value = word ? Number(word.dataset.wordIndex) : undefined;
}

function handleWordHover(event: PointerEvent) {
  if (event.pointerType === "touch") {
    clearWordHover();
    return;
  }
  hoverPoint = { clientX: event.clientX, clientY: event.clientY };
  refreshWordHover();
}

function clearWordHover() {
  hoverPoint = undefined;
  hoveredWordIndex.value = undefined;
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
/* Retain the shared minimum height while drawing a target-sized underline.
   Wider letters in the draft must not stretch its line. */
.fixed-underline {
  position: relative;
  border-bottom-width: 0;
}

.fixed-underline::after {
  content: "";
  position: absolute;
  left: 0;
  bottom: 0;
  width: var(--word-underline-width);
  max-width: 100%;
  border-bottom: 2px solid;
  border-bottom-color: inherit;
  pointer-events: none;
}

/* 词块样式（.question-input-words / .question-input-word）已迁移到
   assets/css/globals.css，与答案区共用同一套规则，保证答题前后零偏移。 */
.question-input-shell {
  width: 100%;
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
}

.question-input-shell.inline {
  display: inline-flex;
  width: fit-content;
  vertical-align: bottom;
}
</style>
