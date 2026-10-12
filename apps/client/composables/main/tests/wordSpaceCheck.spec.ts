import { describe, expect, it } from "vitest";
import { nextTick, ref } from "vue";

import { useInput } from "../question";

function createInput(source = () => "I eat apples", mode = () => true) {
  return useInput({
    source,
    isWordSpaceCheckEnabled: mode,
    setInputCursorPosition: () => {},
    getInputCursorPosition: () => 0,
    getInputWordWidth: (word) => word.length,
    getInputWordCapacity: (word) => word.length,
  });
}

describe("word space checking", () => {
  it("keeps a locked prefix outside the editable draft and completes only on confirmation", () => {
    const input = createInput();
    input.setInputValue("i");
    expect(input.userInputWords[0].confirmed).toBe(false);
    expect(input.confirmCurrentWord()).toBe("confirmed");
    expect(input.inputValue.value).toBe("");
    expect(input.userInputWords[0]).toMatchObject({
      confirmed: true,
      userInput: "i",
      isActive: false,
    });
    input.setInputValue("eat");
    input.setInputValue("");
    expect(input.userInputWords[0].userInput).toBe("i");
    expect(input.userInputWords[1].isActive).toBe(true);
    input.setInputValue("eat");
    expect(input.confirmCurrentWord()).toBe("confirmed");
    input.setInputValue("apples");
    expect(input.getWordHelpRequest()).toEqual({ input: "i eat ", lastWordIndex: 2 });
    expect(input.confirmCurrentWord()).toBe("complete");
    expect(input.confirmCurrentWord()).toBe("inactive");
    expect(input.getWordHelpRequest()).toBeUndefined();
  });

  it.each(["", "e", "eats", "eat apples"])(
    "retains unmatched draft '%s' without advancing",
    (draft) => {
      const input = createInput(() => "eat apples");
      input.setInputValue(draft);
      expect(input.inputValue.value).toBe(draft);
      expect(input.confirmCurrentWord()).toBe("unmatched");
      expect(input.userInputWords[0]).toMatchObject({
        isActive: true,
        incorrect: true,
        confirmed: false,
      });
      expect(input.userInputWords[1].userInput).toBe("");
      input.clearWordFeedback();
      expect(input.inputValue.value).toBe(draft);
      expect(input.userInputWords[0].incorrect).toBe(false);
    },
  );

  it.each([
    ["Don't go", ["DON’T", "GO"]],
    ["woman’s coat", ["WOMAN'S", "coat"]],
    ["anti-social, work.", ["anti", "social", "work"]],
  ])("reuses cloze normalization for %s", (source, drafts) => {
    const input = createInput(() => source);
    drafts.forEach((draft, index) => {
      input.setInputValue(draft);
      expect(input.confirmCurrentWord()).toBe(
        index === drafts.length - 1 ? "complete" : "confirmed",
      );
    });
  });

  it("builds recovery evidence for an unconfirmed token with its accepted prefix", () => {
    const input = createInput();
    input.setInputValue("x");
    expect(input.getWordHelpRequest()).toEqual({ input: "", lastWordIndex: 0 });
    input.setInputValue("I");
    input.confirmCurrentWord();
    input.setInputValue("ea");
    expect(input.getWordHelpRequest()).toEqual({ input: "I ", lastWordIndex: 1 });
  });

  it("clears confirmation state on clear, source changes, and mode changes", async () => {
    const source = ref("I eat apples");
    const mode = ref(true);
    const input = createInput(
      () => source.value,
      () => mode.value,
    );
    input.setInputValue("I");
    input.confirmCurrentWord();
    input.clearInput();
    expect(input.getWordHelpRequest()).toEqual({ input: "", lastWordIndex: 0 });
    input.setInputValue("I");
    input.confirmCurrentWord();
    source.value = "eat apples";
    await nextTick();
    expect(input.userInputWords[0]).toMatchObject({
      text: "eat",
      confirmed: false,
      isActive: true,
    });
    input.setInputValue("eat");
    input.confirmCurrentWord();
    mode.value = false;
    await nextTick();
    expect(input.userInputWords.every((word) => !word.confirmed)).toBe(true);
    input.setInputValue("eat apples");
    expect(input.submitAnswer()).toBe("correct");
  });

  it("handles source text with no editable tokens", () => {
    const input = createInput(() => "...");
    input.setInputValue("anything");
    expect(input.inputValue.value).toBe("");
    expect(input.confirmCurrentWord()).toBe("inactive");
    expect(input.getWordHelpRequest()).toBeUndefined();
  });
});
