import { nextTick, reactive, ref, watch } from "vue";

import { getClozeWords, normalizeClozeInput, normalizeClozeWord } from "~/utils/clozeText";

export { containsAllowedQuestionCharacter, sanitizeQuestionInput } from "~/utils/clozeText";

interface Word {
  text: string;
  isActive: boolean;
  userInput: string;
  incorrect: boolean;
  confirmed: boolean;
  end: number;
  start: number;
  position: number;
  id: number;
}

interface InputOptions {
  source: () => string;
  setInputCursorPosition: (position: number) => void;
  getInputCursorPosition: () => number;
  inputChangedCallback?: (e: KeyboardEvent) => void;
  getInputWordWidth?: (word: string) => number;
  getInputWordCapacity?: (word: string) => number;
  isWordSpaceCheckEnabled?: () => boolean;
}

type IncorrectAnswerCallback = (input: string, lastWordIndex: number) => void;

const separator = " ";

const inputValue = ref("");

export function fitInputToWordWidths(
  value: string,
  targetWords: string[],
  getInputWordWidth: (word: string) => number,
  getInputWordCapacity: (word: string) => number,
) {
  return value
    .split(separator)
    .slice(0, targetWords.length)
    .map((word, index) => {
      const capacity = getInputWordCapacity(targetWords[index]);
      let fittedWord = "";

      for (const character of word) {
        const nextWord = fittedWord + character;
        if (getInputWordWidth(nextWord) > capacity) break;
        fittedWord = nextWord;
      }

      return fittedWord;
    })
    .join(separator);
}

export function clearQuestionInput() {
  inputValue.value = "";
}

export function useInput({
  source,
  setInputCursorPosition,
  getInputCursorPosition,
  inputChangedCallback,
  getInputWordWidth,
  getInputWordCapacity,
  isWordSpaceCheckEnabled = () => false,
}: InputOptions) {
  const userInputWords = reactive<Word[]>([]);
  let confirmedWordCount = 0;

  setupUserInputWords();
  if (!isWordSpaceCheckEnabled()) updateActiveWord(getInputCursorPosition());

  function setInputValue(val: string) {
    if (isWordSpaceCheckEnabled()) {
      const word = userInputWords[confirmedWordCount];
      // The native input only contains the current draft. Confirmed words never
      // enter its editable value, including during paste or selection replacement.
      const draft = word ? normalizeClozeInput(val, [word.text]).trim() : "";
      inputValue.value = draft;
      if (word) word.userInput = draft;
      if (draft !== val) {
        void nextTick(() => setInputCursorPosition(draft.length));
      }
      return;
    }

    const targetWords = getClozeWords(source());
    const sanitizedValue = normalizeClozeInput(val, targetWords);
    const fitInput = (value: string) => {
      if (!getInputWordWidth || !getInputWordCapacity)
        return value.split(separator).slice(0, targetWords.length).join(separator);

      return fitInputToWordWidths(value, targetWords, getInputWordWidth, getInputWordCapacity);
    };
    const fittedValue = fitInput(sanitizedValue);
    const cursorValue = fitInput(
      normalizeClozeInput(val.slice(0, getInputCursorPosition()), targetWords),
    );

    inputValue.value = fittedValue;
    resetAllWordUserInput();
    inputSyncUserInputWords();
    updateActiveWord(fittedValue ? cursorValue.length : 0);
    if (fittedValue !== val) {
      void nextTick(() => setInputCursorPosition(cursorValue.length));
    }
  }

  function clearInput() {
    confirmedWordCount = 0;
    inputValue.value = "";
    userInputWords.forEach((word) => {
      word.userInput = "";
      word.incorrect = false;
      word.confirmed = false;
    });
    inputSyncUserInputWords();
    updateActiveWord(0);
  }

  function createWord(word: string, id: number) {
    return reactive({
      text: word,
      isActive: false,
      userInput: "",
      incorrect: false,
      confirmed: false,
      start: 0,
      end: 0,
      position: 0,
      id,
    } as Word);
  }

  function setupUserInputWords() {
    watch(
      () => [source(), isWordSpaceCheckEnabled()],
      () => {
        resetUserInputWords();

        getClozeWords(source())
          .map(createWord)
          .forEach((word, i) => {
            userInputWords[i] = word;
            // 首个单词自动聚焦
            i === 0 && (userInputWords[0].isActive = true);
          });
      },
      { immediate: true },
    );
  }

  function confirmCurrentWord() {
    const word = userInputWords[confirmedWordCount];
    if (!word) return "inactive";
    if (!word.userInput || normalizeClozeWord(word.userInput) !== normalizeClozeWord(word.text)) {
      word.incorrect = true;
      return "unmatched";
    }

    word.confirmed = true;
    word.incorrect = false;
    resetAllWordActive();
    confirmedWordCount++;
    inputValue.value = "";
    const nextWord = userInputWords[confirmedWordCount];
    if (nextWord) nextWord.isActive = true;
    return nextWord ? "confirmed" : "complete";
  }

  function clearWordFeedback() {
    userInputWords.forEach((word) => {
      word.incorrect = false;
    });
  }

  function getWordHelpRequest() {
    if (!userInputWords[confirmedWordCount]) return undefined;
    // Enter always means help, even when the unconfirmed draft already matches.
    const prefix = userInputWords.slice(0, confirmedWordCount).map((word) => word.userInput);
    return { input: [...prefix, ""].join(separator), lastWordIndex: confirmedWordCount };
  }

  function inputSyncUserInputWords() {
    let position = 0;
    const inputs = inputValue.value.split(separator);
    userInputWords.forEach((word, index) => {
      const input = inputs[index] ?? "";
      userInputWords[index].userInput = input;

      userInputWords[index].start = position;
      userInputWords[index].end = position + input.length;

      position += input.length + 1; // Add 1 for the space after each word
    });
  }

  function resetAllWordUserInput() {
    userInputWords.forEach((word) => {
      word.userInput = "";
    });
  }

  function resetAllWordActive() {
    userInputWords.forEach((word) => {
      word.isActive = false;
    });
  }

  function updateActiveWord(position: number) {
    resetAllWordActive();

    for (let i = 0; i < userInputWords.length; i++) {
      const word = userInputWords[i];
      if (position >= word.start && position <= word.end) {
        word.isActive = true;
        break;
      }
    }
  }

  function checkWordCorrect() {
    return userInputWords.every(
      (word) => normalizeClozeWord(word.userInput) === normalizeClozeWord(word.text),
    );
  }

  function markIncorrectWord(lastWordIndex: number) {
    userInputWords.forEach((word, index) => {
      const formattedWord = normalizeClozeWord(word.userInput);
      word.incorrect = index <= lastWordIndex && formattedWord !== normalizeClozeWord(word.text);
    });
  }

  function lastWordIsActive() {
    let len = userInputWords.length;
    return userInputWords[len - 1]?.isActive ?? false;
  }

  function submitAnswer(correctCallback?: () => void, wrongCallback?: IncorrectAnswerCallback) {
    const submittedInput = inputValue.value;
    const activeWordIndex = userInputWords.findIndex((word) => word.isActive);
    const lastWordIndex =
      activeWordIndex >= 0
        ? activeWordIndex
        : Math.min(submittedInput.split(separator).length - 1, userInputWords.length - 1);
    markIncorrectWord(lastWordIndex);

    if (checkWordCorrect()) {
      resetAllWordActive();
      correctCallback?.(); // 调用输入正确的回调
      inputValue.value = "";
      return "correct";
    }
    if (!userInputWords.some((word) => word.incorrect)) return "continue";

    resetAllWordActive();
    wrongCallback?.(submittedInput, lastWordIndex);
    return "incorrect";
  }

  function handleSpaceSubmitAnswer(
    useSpaceSubmitAnswer: KeyboardInputOptions["useSpaceSubmitAnswer"],
  ) {
    if (useSpaceSubmitAnswer?.enable) {
      submitAnswer(useSpaceSubmitAnswer.rightCallback, useSpaceSubmitAnswer.errorCallback);
    }
  }

  interface KeyboardInputOptions {
    useSpaceSubmitAnswer?: {
      enable: boolean;
      rightCallback?: () => void;
      errorCallback?: IncorrectAnswerCallback;
    };
  }

  function handleKeyboardInput(e: KeyboardEvent, options?: KeyboardInputOptions) {
    // 禁止方向键移动
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) {
      e.preventDefault();
      return;
    }

    // 在最后一个单词位置启用空格提交
    if (e.code === "Space" && lastWordIsActive()) {
      e.preventDefault();
      e.stopPropagation(); // 阻止事件冒泡
      handleSpaceSubmitAnswer(options?.useSpaceSubmitAnswer);
      return;
    }

    inputChangedCallback?.(e);
  }

  function resetUserInputWords() {
    confirmedWordCount = 0;
    inputValue.value = "";
    userInputWords.splice(0, userInputWords.length);
  }

  return {
    inputValue,
    userInputWords,
    submitAnswer,
    setInputValue,
    clearInput,
    handleKeyboardInput,
    resetUserInputWords,
    confirmCurrentWord,
    clearWordFeedback,
    getWordHelpRequest,
  };
}
