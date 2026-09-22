import { reactive, ref, watchEffect } from "vue";

interface Word {
  text: string;
  isActive: boolean;
  userInput: string;
  incorrect: boolean;
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
}

const separator = " ";

const inputValue = ref("");

const QUESTION_INPUT_ALLOWED_CHARACTERS = /[^A-Za-z '.,?!-]/g;
const LATIN_LETTER = /[A-Za-z]/;

export function sanitizeQuestionInput(value: string) {
  return value.replace(QUESTION_INPUT_ALLOWED_CHARACTERS, "");
}

export function containsLatinLetter(value: string) {
  return LATIN_LETTER.test(value);
}

export function clearQuestionInput() {
  inputValue.value = "";
}

export function useInput({
  source,
  setInputCursorPosition,
  getInputCursorPosition,
  inputChangedCallback,
}: InputOptions) {
  const userInputWords = reactive<Word[]>([]);

  setupUserInputWords();
  updateActiveWord(getInputCursorPosition());

  function setInputValue(val: string) {
    const sanitizedValue = sanitizeQuestionInput(val);
    const cursorPosition = sanitizeQuestionInput(val.slice(0, getInputCursorPosition())).length;

    inputValue.value = sanitizedValue;
    resetAllWordUserInput();
    inputSyncUserInputWords();
    updateActiveWord(sanitizedValue ? cursorPosition : 0);
  }

  function clearInput() {
    inputValue.value = "";
    userInputWords.forEach((word) => {
      word.userInput = "";
      word.incorrect = false;
    });
    updateActiveWord(0);
  }

  function createWord(word: string, id: number) {
    return reactive({
      text: word,
      isActive: false,
      userInput: "",
      incorrect: false,
      start: 0,
      end: 0,
      position: 0,
      id,
    } as Word);
  }

  function setupUserInputWords() {
    watchEffect(() => {
      resetUserInputWords();

      const english = source();
      english
        .split(separator)
        .map(createWord)
        .forEach((word, i) => {
          userInputWords[i] = word;
          // 首个单词自动聚焦
          i === 0 && (userInputWords[0].isActive = true);
        });
    });
  }

  function userInputWordsSyncInput() {
    inputValue.value = userInputWords
      .map(({ userInput }) => {
        return userInput;
      })
      .join(separator);
  }

  function inputSyncUserInputWords() {
    let position = 0;

    inputValue.value.split(separator).forEach((input, index) => {
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
    return userInputWords.every((w) => !w.incorrect);
  }

  function markIncorrectWord() {
    userInputWords.forEach((word) => {
      const formattedWord = formatInputText(word.userInput);
      if (formattedWord !== word.text.toLocaleLowerCase()) {
        word.incorrect = true;
      } else {
        word.incorrect = false;
      }
    });
  }

  function lastWordIsActive() {
    let len = userInputWords.length;
    return userInputWords[len - 1].isActive;
  }

  // 将‘ 转化为', 做模糊匹配, 后续可拓展其他的模糊匹配算法
  function formatInputText(word: string) {
    return word.toLocaleLowerCase().replace(/‘|’|“|"|”/g, "'");
  }

  function submitAnswer(correctCallback?: () => void, wrongCallback?: () => void) {
    resetAllWordActive();
    markIncorrectWord();

    if (checkWordCorrect()) {
      correctCallback?.(); // 调用输入正确的回调
      inputValue.value = "";
    } else {
      wrongCallback?.(); // 调用输入错误的回调
    }
  }

  function handleSpaceSubmitAnswer(
    useSpaceSubmitAnswer: KeyboardInputOptions["useSpaceSubmitAnswer"],
  ) {
    if (useSpaceSubmitAnswer?.enable) {
      submitAnswer(
        () => {
          useSpaceSubmitAnswer?.rightCallback?.();
        },
        () => {
          useSpaceSubmitAnswer?.errorCallback?.();
        },
      );
    }
  }

  interface KeyboardInputOptions {
    useSpaceSubmitAnswer?: {
      enable: boolean;
      rightCallback?: () => void;
      errorCallback?: () => void;
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
  };
}
