import { createTestingPinia } from "@pinia/testing";
import { enableAutoUnmount, mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useAnswerTip } from "~/composables/main/answerTip";
import { useGameMode } from "~/composables/main/game";
import { lookupPronunciation } from "~/services/pronunciation";
import { useExerciseStore } from "~/store/exercise";
import QuestionInput from "../QuestionInput.vue";
import { useCorrectSound } from "../useCorrectSound";

// A stable spy lets us count one sound per confirmed token, including the final one.
vi.mock("../useCorrectSound", () => {
  const playCorrectSound = vi.fn();
  return { useCorrectSound: () => ({ playCorrectSound }) };
});
vi.mock("~/services/pronunciation", () => ({ lookupPronunciation: vi.fn() }));

enableAutoUnmount(afterEach);

describe("word space checking in QuestionInput", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    localStorage.setItem("wordSpaceCheck", "true");
    localStorage.setItem("keyboardSoundEnabled", "false");
    useGameMode().showQuestion();
    useAnswerTip().hiddenAnswerTip();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    for (const key of [
      "wordSpaceCheck",
      "keyboardSoundEnabled",
      "spaceSubmitAnswer",
      "autoNextQuestion",
    ]) {
      localStorage.removeItem(key);
    }
  });

  function setup(english = "I eat apples") {
    const pinia = createTestingPinia({ createSpy: vi.fn });
    const store = useExerciseStore(pinia);
    store.currentStatement = { id: "word-space", order: 1, english };
    const wrapper = mount(QuestionInput, { global: { plugins: [pinia] } });
    const input = wrapper.get("input");
    const words = () => wrapper.findAll(".question-input-word");
    const press = (code = "Space", extra = {}) =>
      input.trigger("keydown", {
        code,
        key: code === "Space" ? " " : "Enter",
        ...extra,
      });
    return { input, wrapper, store, words, press };
  }

  it.each([false, true])(
    "confirms only the current token regardless of space-submit: %s",
    async (spaceSubmit) => {
      localStorage.setItem("spaceSubmitAnswer", String(spaceSubmit));
      const { input, words, store, press } = setup();
      await input.setValue("I");
      expect(words()[0].classes()).not.toContain("border-b-transparent");
      expect(useCorrectSound().playCorrectSound).not.toHaveBeenCalled();
      const width = words()[0].attributes("style");
      await press();
      expect(words()[0].classes()).toContain("border-b-transparent");
      expect(words()[0].attributes("style")).toBe(width);
      expect(words()[1].classes()).toContain("border-b-fuchsia-500");
      expect((input.element as HTMLInputElement).value).toBe("");
      await input.trigger("keydown", { key: "Backspace", code: "Backspace" });
      await input.setValue("");
      expect(words()[0].text()).toBe("I");
      await input.setValue("eat");
      await press();
      expect(store.passCurrentStatement).not.toHaveBeenCalled();
      await input.setValue("apples");
      expect(store.passCurrentStatement).not.toHaveBeenCalled();
      await press();
      expect(store.passCurrentStatement).toHaveBeenCalledOnce();
      expect(useCorrectSound().playCorrectSound).toHaveBeenCalledTimes(3);
      expect(useGameMode().isAnswer()).toBe(true);
      await press();
      expect(store.passCurrentStatement).toHaveBeenCalledOnce();
      expect(useCorrectSound().playCorrectSound).toHaveBeenCalledTimes(3);
    },
  );

  it.each(["", "ea", "eats", "eat apples"])(
    "briefly marks '%s' without clearing or recovery",
    async (draft) => {
      const { input, words, store, press } = setup("eat apples");
      await input.setValue(draft);
      await press();
      expect(words()[0].classes()).toContain("border-b-red-500");
      expect(words()[1].classes()).not.toContain("border-b-red-500");
      await vi.advanceTimersByTimeAsync(299);
      expect(words()[0].classes()).toContain("border-b-red-500");
      await vi.advanceTimersByTimeAsync(1);
      expect(words()[0].classes()).toContain("border-b-fuchsia-500");
      expect((input.element as HTMLInputElement).value).toBe(draft);
      expect(store.failCurrentStatement).not.toHaveBeenCalled();
      expect(store.passCurrentStatement).not.toHaveBeenCalled();
      expect(useCorrectSound().playCorrectSound).not.toHaveBeenCalled();
    },
  );

  it("cancels red feedback as soon as the draft changes", async () => {
    const { input, words, press } = setup();
    await input.setValue("x");
    await press();
    await input.setValue("I");
    expect(words()[0].classes()).toContain("border-b-fuchsia-500");
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(["", "x", "eat"])(
    "requests help with the current draft '%s' treated as empty",
    async (draft) => {
      const { input, store, press } = setup();
      await input.setValue("I");
      await press();
      await input.setValue(draft);
      await press("Enter");
      expect(store.failCurrentStatement).toHaveBeenCalledOnce();
      expect(store.failCurrentStatement).toHaveBeenCalledWith("I ", 1);
      expect(store.passCurrentStatement).not.toHaveBeenCalled();
      expect((input.element as HTMLInputElement).value).toBe("");
    },
  );

  it("retains single-word pronunciation help until successful confirmation", async () => {
    vi.mocked(lookupPronunciation).mockResolvedValue(["kəm", "ˈpjuː", "tər"]);
    const { input, wrapper, press } = setup("computer");
    await press("Enter");
    expect(wrapper.emitted("hint-change")?.at(-1)).toEqual([["kəm", "ˈpjuː", "tər"]]);
    await input.setValue("computer");
    await press();
    expect(wrapper.emitted("hint-change")?.at(-1)).toEqual([undefined]);
  });

  it("ignores confirming keys during composition and long-press repeats", async () => {
    const { input, store, words, press } = setup();
    await input.setValue("I");
    await input.trigger("compositionstart");
    await press();
    await press("Enter");
    expect(words()[0].classes()).not.toContain("border-b-transparent");
    await input.trigger("compositionend", { data: "I" });
    await press("Space", { isComposing: true });
    await press("Enter", { keyCode: 229 });
    await press("Space", { repeat: true });
    await press("Enter", { repeat: true });
    expect(useCorrectSound().playCorrectSound).not.toHaveBeenCalled();
    expect(store.failCurrentStatement).not.toHaveBeenCalled();
    await press();
    expect(words()[0].classes()).toContain("border-b-transparent");
  });

  it("handles soft-keyboard spaces but does not confirm pasted text", async () => {
    const { input, words, wrapper } = setup();
    await input.setValue("I eat apples");
    await input.trigger("beforeinput", { inputType: "insertFromPaste", data: "I eat apples" });
    expect(useCorrectSound().playCorrectSound).not.toHaveBeenCalled();
    expect(words()[1].text()).toBe("");
    await input.setValue("I");
    const event = new InputEvent("beforeinput", {
      cancelable: true,
      inputType: "insertText",
      data: " ",
    });
    input.element.dispatchEvent(event);
    await wrapper.vm.$nextTick();
    expect(event.defaultPrevented).toBe(true);
    expect(words()[0].classes()).toContain("border-b-transparent");
    expect(useCorrectSound().playCorrectSound).toHaveBeenCalledOnce();
  });

  it("clears confirmation and pending feedback when an answer hint is shown", async () => {
    const { input, words, wrapper, press } = setup();
    await input.setValue("I");
    await press();
    await press();
    expect(vi.getTimerCount()).toBe(1);
    useAnswerTip().showAnswerTip();
    await wrapper.vm.$nextTick();
    expect(vi.getTimerCount()).toBe(0);
    expect(words().every((word) => !word.classes().includes("border-b-transparent"))).toBe(true);
    await press();
    await press("Enter");
    expect(useCorrectSound().playCorrectSound).toHaveBeenCalledOnce();
  });

  it("clears confirmation and feedback on view changes, question changes, and unmount", async () => {
    const { input, words, wrapper, store, press } = setup();
    await input.setValue("I");
    await press();
    await press();
    store.currentStatement = { id: "next", order: 2, english: "you go" };
    await wrapper.vm.$nextTick();
    expect(vi.getTimerCount()).toBe(0);
    expect(words()[0].classes()).toContain("border-b-fuchsia-500");
    expect(words()[0].text()).toBe("");
    await press();
    wrapper.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
