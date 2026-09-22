import { describe, expect, it, vi } from "vitest";

import { fitInputToWordWidths, useInput } from "../question";

describe("question", () => {
  const characterWidth = (word: string) => word.length;
  const targetCapacity = (word: string) => word.length;

  it("fits each input word to its target word capacity", () => {
    expect(fitInputToWordWidths("iiiii eate", ["iii", "eat"], characterWidth, targetCapacity)).toBe(
      "iii eat",
    );
  });

  it("keeps spaces between fitted words and filters extra words", () => {
    expect(fitInputToWordWidths("i eate apple", ["i", "eat"], characterWidth, targetCapacity)).toBe(
      "i eat",
    );
  });

  it("supports weighted character widths and a fixed four-character capacity", () => {
    const weightedWidth = (word: string) =>
      word.split("").reduce((total, character) => total + (character === "w" ? 1.5 : 0.5), 0);

    expect(fitInputToWordWidths("wwi", ["ww"], weightedWidth, weightedWidth)).toBe("ww");
    expect(fitInputToWordWidths("tests", ["word"], characterWidth, () => 4)).toBe("test");
  });

  it("should parse user input correctly", () => {
    const setInputCursorPosition = () => {};
    const getInputCursorPosition = () => 0;

    const { userInputWords, setInputValue } = useInput({
      source: () => "i eat",
      setInputCursorPosition,
      getInputCursorPosition,
    });

    setInputValue("i eat");

    expect(userInputWords).toMatchInlineSnapshot(`
      [
        {
          "end": 1,
          "id": 0,
          "incorrect": false,
          "isActive": true,
          "position": 0,
          "start": 0,
          "text": "i",
          "userInput": "i",
        },
        {
          "end": 5,
          "id": 1,
          "incorrect": false,
          "isActive": false,
          "position": 0,
          "start": 2,
          "text": "eat",
          "userInput": "eat",
        },
      ]
    `);
  });

  it("should be correct when checked the answer", async () => {
    const setInputCursorPosition = () => {};
    const getInputCursorPosition = () => 0;

    const { setInputValue, submitAnswer } = useInput({
      source: () => "i eat",
      setInputCursorPosition,
      getInputCursorPosition,
    });

    setInputValue("i eat");

    const correctCallback = vi.fn();
    const wrongCallback = vi.fn();
    submitAnswer(correctCallback, wrongCallback);

    expect(correctCallback).toBeCalled();
    expect(wrongCallback).not.toBeCalled();
  });

  it("should be incorrect when checked the answer", async () => {
    const setInputCursorPosition = () => {};
    const getInputCursorPosition = () => 0;

    const { userInputWords, setInputValue, submitAnswer } = useInput({
      source: () => "i eat",
      setInputCursorPosition,
      getInputCursorPosition,
    });

    setInputValue("i like");

    const correctCallback = vi.fn();
    const wrongCallback = vi.fn();
    submitAnswer(correctCallback, wrongCallback);

    expect(correctCallback).not.toBeCalled();
    expect(wrongCallback).toBeCalled();
    expect(userInputWords[1].incorrect).toBe(true);
  });

  it("should accept an ASCII apostrophe in the input", async () => {
    const setInputCursorPosition = () => {};
    const getInputCursorPosition = () => 0;

    const { setInputValue, submitAnswer } = useInput({
      source: () => "i don't",
      setInputCursorPosition,
      getInputCursorPosition,
    });

    setInputValue("i don't");

    const correctCallback = vi.fn();
    const wrongCallback = vi.fn();
    submitAnswer(correctCallback, wrongCallback);

    expect(correctCallback).toBeCalled();
    expect(wrongCallback).not.toBeCalled();
  });

  it("should filter input to Latin letters, spaces, and English punctuation", () => {
    const setInputCursorPosition = () => {};
    const getInputCursorPosition = () => 0;

    const { inputValue, userInputWords, setInputValue } = useInput({
      source: () => "Abe' .?!-",
      setInputCursorPosition,
      getInputCursorPosition,
    });

    setInputValue("A中b1\te' .?!-_");

    expect(inputValue.value).toBe("Abe' .?!-");
    expect(userInputWords.map((word) => word.userInput)).toEqual(["Abe'", ".?!-"]);
  });

  it("should filter input that exceeds the configured word capacities", () => {
    const setInputCursorPosition = () => {};
    const getInputCursorPosition = () => 0;

    const { inputValue, userInputWords, setInputValue } = useInput({
      source: () => "iii eat",
      setInputCursorPosition,
      getInputCursorPosition,
      getInputWordWidth: characterWidth,
      getInputWordCapacity: targetCapacity,
    });

    setInputValue("iiiii eate");

    expect(inputValue.value).toBe("iii eat");
    expect(userInputWords.map((word) => word.userInput)).toEqual(["iii", "eat"]);
  });

  it("should be the first word should be active", () => {
    const setInputCursorPosition = () => {};
    const getInputCursorPosition = () => 0;

    const { userInputWords } = useInput({
      source: () => "i eat",
      setInputCursorPosition,
      getInputCursorPosition,
    });

    expect(userInputWords[0].isActive).toBe(true);
  });

  it("should be the first word should be active", () => {
    const setInputCursorPosition = () => {};
    const getInputCursorPosition = () => 0;

    const { userInputWords } = useInput({
      source: () => "i eat",
      setInputCursorPosition,
      getInputCursorPosition,
    });

    expect(userInputWords[0].isActive).toBe(true);
  });

  it("should be changed the activated word based on the user's input", () => {
    const setInputCursorPosition = () => {};
    const getInputCursorPosition = vi.fn();

    const { userInputWords, setInputValue } = useInput({
      source: () => "i eat",
      setInputCursorPosition,
      getInputCursorPosition,
    });

    getInputCursorPosition.mockReturnValue(1);
    setInputValue("i");
    expect(userInputWords[0].isActive).toBe(true);

    getInputCursorPosition.mockReturnValue(2);
    setInputValue("i ");
    expect(userInputWords[1].isActive).toBe(true);

    getInputCursorPosition.mockReturnValue(3);
    setInputValue("i e");
    expect(userInputWords[1].isActive).toBe(true);

    getInputCursorPosition.mockReturnValue(3);
    setInputValue("iea");
    expect(userInputWords[0].isActive).toBe(true);
  });

  it("should allow correcting an incorrect answer and submitting again", () => {
    const setInputCursorPosition = () => {};
    const getInputCursorPosition = () => 0;

    const { setInputValue, userInputWords, submitAnswer } = useInput({
      source: () => "i eat",
      setInputCursorPosition,
      getInputCursorPosition,
    });

    setInputValue("he eat");
    submitAnswer();

    expect(userInputWords[0].incorrect).toBe(true);

    const correctCallback = vi.fn();
    setInputValue("i eat");
    submitAnswer(correctCallback);

    expect(correctCallback).toBeCalled();
    expect(userInputWords.every((word) => !word.incorrect)).toBe(true);
  });

  it("should clear the input and error state when showing an answer tip", () => {
    const setInputCursorPosition = () => {};
    const getInputCursorPosition = () => 0;

    const { userInputWords, setInputValue, submitAnswer, clearInput, inputValue } = useInput({
      source: () => "i eat",
      setInputCursorPosition,
      getInputCursorPosition,
    });

    setInputValue("i like");
    submitAnswer();
    clearInput();

    expect(inputValue.value).toBe("");
    expect(userInputWords.map((word) => word.userInput)).toEqual(["", ""]);
    expect(userInputWords.every((word) => !word.incorrect)).toBe(true);
  });

  it("should prevent move", () => {
    const setInputCursorPosition = () => {};
    const getInputCursorPosition = () => 0;

    const { setInputValue, handleKeyboardInput } = useInput({
      source: () => "i eat apple",
      setInputCursorPosition,
      getInputCursorPosition,
    });

    setInputValue("i ea ap");

    // move to left
    const preventDefaultLeft = vi.fn();
    handleKeyboardInput({
      code: "ArrowLeft",
      preventDefault: preventDefaultLeft,
    } as any as KeyboardEvent);
    expect(preventDefaultLeft).toBeCalled();

    // move to right
    const preventDefaultRight = vi.fn();
    handleKeyboardInput({
      code: "ArrowLeft",
      preventDefault: preventDefaultRight,
    } as any as KeyboardEvent);
    expect(preventDefaultRight).toBeCalled();
  });

  it("should prevent space when focus on last word", async () => {
    const setInputCursorPosition = () => {};
    const getInputCursorPosition = vi.fn();

    const { setInputValue, handleKeyboardInput } = useInput({
      source: () => "i eat apple",
      setInputCursorPosition,
      getInputCursorPosition,
    });

    const inputValue = "i eat apple";
    getInputCursorPosition.mockReturnValue(inputValue.length);
    setInputValue(inputValue);

    const preventDefault = vi.fn();
    const stopPropagation = vi.fn();
    handleKeyboardInput({
      code: "Space",
      preventDefault,
      stopPropagation,
    } as any as KeyboardEvent);

    expect(preventDefault).toBeCalled();
    expect(stopPropagation).toBeCalled();
  });

  it("should submit answer when enable use space", () => {
    const setInputCursorPosition = () => {};
    const getInputCursorPosition = vi.fn();

    const { setInputValue, handleKeyboardInput } = useInput({
      source: () => "i eat apple",
      setInputCursorPosition,
      getInputCursorPosition,
    });

    const inputValue = "i eat apple";
    getInputCursorPosition.mockReturnValue(inputValue.length);
    setInputValue(inputValue);

    const submitAnswerCallback = vi.fn();

    handleKeyboardInput(
      {
        code: "Space",
        preventDefault: () => {},
        stopPropagation: () => {},
      } as any as KeyboardEvent,
      {
        useSpaceSubmitAnswer: {
          enable: true,
          rightCallback: submitAnswerCallback,
        },
      },
    );

    expect(submitAnswerCallback).toBeCalled();
  });

  describe("input change call back", () => {
    it("should trigger when input regular character", () => {
      const setInputCursorPosition = () => {};
      const getInputCursorPosition = vi.fn();
      const inputChangedCallback = vi.fn();

      const { setInputValue, handleKeyboardInput } = useInput({
        source: () => "i eat apple",
        setInputCursorPosition,
        getInputCursorPosition,
        inputChangedCallback,
      });

      const inputValue = "i eat ap";
      getInputCursorPosition.mockReturnValue(inputValue.length);
      setInputValue(inputValue);

      handleKeyboardInput({
        code: "p",
      } as any as KeyboardEvent);

      expect(inputChangedCallback).toBeCalledWith({ code: "p" });
    });
  });
});
