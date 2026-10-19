import { createTestingPinia } from "@pinia/testing";
import { enableAutoUnmount, mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useAnswerTip } from "~/composables/main/answerTip";
import { useGameMode } from "~/composables/main/game";
import { useWordAudio } from "~/composables/useWordAudio";
import { lookupPronunciation } from "~/services/pronunciation";
import { useExerciseStore } from "~/store/exercise";
import QuestionInput from "../QuestionInput.vue";
import { useCorrectSound } from "../useCorrectSound";

// A stable spy lets us count one sound per confirmed token, including the final one.
// Exercise the retained alternate modes independently of the temporary production restriction.
vi.mock("~/utils/practiceModes", () => ({
  practiceModeAvailability: { progressive: true, single: true },
}));

vi.mock("~/composables/useWordAudio", () => {
  const playAutoWordAudio = vi.fn();
  const playAutoSentenceAudio = vi.fn();
  return {
    useWordAudio: () => ({
      loadingElement: undefined,
      playAutoWordAudio,
      playAutoSentenceAudio,
    }),
    findWordUnderInput: vi.fn(),
    playWordUnderInput: vi.fn(),
  };
});

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
    for (const key of ["wordSpaceCheck", "keyboardSoundEnabled", "autoNextQuestion"]) {
      localStorage.removeItem(key);
    }
  });

  function setup(english = "I eat apples") {
    const pinia = createTestingPinia({ createSpy: vi.fn });
    const store = useExerciseStore(pinia);
    store.currentStatement = { id: "word-space", order: 1, english };
    const wrapper = mount(QuestionInput, { global: { plugins: [pinia] } });
    const input = wrapper.get("input");
    const words = () => wrapper.findAll<HTMLElement>(".question-input-word");
    const press = (code = "Space", extra = {}) =>
      input.trigger("keydown", {
        code,
        key: code === "Space" ? " " : "Enter",
        ...extra,
      });
    return { input, wrapper, store, words, press };
  }

  it("leaves legacy sentence input without a native token-length limit", async () => {
    localStorage.setItem("wordSpaceCheck", "false");
    const { input, store, press } = setup("I eat");
    expect(input.attributes("maxlength")).toBeUndefined();
    await input.setValue("I eat");
    await press();
    expect(store.passCurrentStatement).toHaveBeenCalledOnce();
    expect(useWordAudio().playAutoWordAudio).not.toHaveBeenCalled();
    expect(useWordAudio().playAutoSentenceAudio).toHaveBeenCalledWith("I eat");
  });

  it("confirms only the current token with Space", async () => {
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
    expect(useWordAudio().playAutoWordAudio).toHaveBeenCalledWith("I");
    await input.trigger("keydown", { key: "Backspace", code: "Backspace" });
    await input.setValue("");
    expect(words()[0].text()).toBe("I");
    await input.setValue("eat");
    await press();
    expect(store.passCurrentStatement).not.toHaveBeenCalled();
    expect(useWordAudio().playAutoWordAudio).toHaveBeenLastCalledWith("eat");
    await input.setValue("apples");
    expect(store.passCurrentStatement).not.toHaveBeenCalled();
    await press();
    expect(store.passCurrentStatement).toHaveBeenCalledOnce();
    expect(useCorrectSound().playCorrectSound).toHaveBeenCalledTimes(3);
    expect(useWordAudio().playAutoWordAudio).toHaveBeenCalledTimes(2);
    expect(useWordAudio().playAutoSentenceAudio).toHaveBeenCalledOnce();
    expect(useWordAudio().playAutoSentenceAudio).toHaveBeenCalledWith("I eat apples");
    expect(useGameMode().isAnswer()).toBe(true);
    await press();
    expect(store.passCurrentStatement).toHaveBeenCalledOnce();
    expect(useCorrectSound().playCorrectSound).toHaveBeenCalledTimes(3);
    expect(useWordAudio().playAutoSentenceAudio).toHaveBeenCalledOnce();
  });

  it.each([
    { source: "Don’t go.", drafts: ["DON'T", "GO"] },
    { source: "woman's coat", drafts: ["WOMAN’S", "coat"] },
    { source: "anti-social", drafts: ["anti", "social"] },
  ])("normalizes each Space-confirmed token in $source", async ({ source, drafts }) => {
    const { input, words, store, press } = setup(source);
    for (const [index, draft] of drafts.entries()) {
      await input.setValue(draft);
      await press();
      expect(words()[index].classes()).toContain("border-b-transparent");
    }
    expect(store.failCurrentStatement).not.toHaveBeenCalled();
    expect(store.passCurrentStatement).toHaveBeenCalledOnce();
    expect(useCorrectSound().playCorrectSound).toHaveBeenCalledTimes(drafts.length);
    expect(useWordAudio().playAutoWordAudio).toHaveBeenCalledTimes(drafts.length - 1);
    expect(useWordAudio().playAutoSentenceAudio).toHaveBeenCalledOnce();
    expect(useWordAudio().playAutoSentenceAudio).toHaveBeenCalledWith(source);
  });

  it("synchronizes the native draft before Space confirmation", async () => {
    const { input, words, store, press } = setup("I eat");
    (input.element as HTMLInputElement).value = "I";
    await press();
    expect(words()[0].classes()).toContain("border-b-transparent");
    expect((input.element as HTMLInputElement).value).toBe("");
    (input.element as HTMLInputElement).value = "eat";
    await press();
    expect(store.passCurrentStatement).toHaveBeenCalledOnce();
    expect(store.failCurrentStatement).not.toHaveBeenCalled();
    expect(useCorrectSound().playCorrectSound).toHaveBeenCalledTimes(2);
  });

  it.each(["", "ea", "eaz", "ear"])(
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
      expect(useWordAudio().playAutoWordAudio).not.toHaveBeenCalled();
      expect(useWordAudio().playAutoSentenceAudio).not.toHaveBeenCalled();
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

  it("limits drafts to the active token length without changing its underline width", async () => {
    const { input, words, store, press } = setup("eat apples");
    const underlineWidth = words()[0].element.style.getPropertyValue("--word-underline-width");
    expect(words()[0].classes()).toContain("fixed-underline");
    expect(input.attributes("maxlength")).toBe("3");
    for (const [raw, draft] of [
      ["e", "e"],
      ["eatx", "eat"],
      ["EATXXXX", "EAT"],
      ["eaz apples", "eaz"],
    ]) {
      await input.setValue(raw);
      expect((input.element as HTMLInputElement).value).toBe(draft);
      expect(words()[0].text()).toBe(draft);
      expect(words()[0].element.style.getPropertyValue("--word-underline-width")).toBe(
        underlineWidth,
      );
    }
    await press();
    expect(words()[0].classes()).toContain("border-b-red-500");
    expect(store.passCurrentStatement).not.toHaveBeenCalled();
    expect(store.failCurrentStatement).not.toHaveBeenCalled();
    expect(useCorrectSound().playCorrectSound).not.toHaveBeenCalled();
    await input.setValue("eat");
    await press();
    expect(input.attributes("maxlength")).toBe("6");
    await input.setValue("applesx");
    expect((input.element as HTMLInputElement).value).toBe("apples");
    expect(words()[0].text()).toBe("eat");
    await press();
    expect(store.passCurrentStatement).toHaveBeenCalledOnce();
  });

  it.each(["", "x", "ea", "eaz", "ear"])(
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
      expect(vi.getTimerCount()).toBe(0);
      expect(useCorrectSound().playCorrectSound).toHaveBeenCalledOnce();
    },
  );

  it("rolls back with Enter even when the current token matches", async () => {
    const { input, words, store, press } = setup();
    await input.setValue("I");
    await press("Enter");
    expect(words()[0].classes()).not.toContain("border-b-transparent");
    expect(store.passCurrentStatement).not.toHaveBeenCalled();
    expect(store.failCurrentStatement).toHaveBeenCalledOnce();
    expect(store.failCurrentStatement).toHaveBeenCalledWith("", 0);
    expect((input.element as HTMLInputElement).value).toBe("");
    expect(useCorrectSound().playCorrectSound).not.toHaveBeenCalled();
    expect(useWordAudio().playAutoWordAudio).not.toHaveBeenCalled();
  });

  it("keeps the accepted prefix when Enter rolls back a matching token", async () => {
    const { input, store, press } = setup();
    await input.setValue("I");
    await press();
    await input.setValue("eat");
    await press("Enter");
    expect(store.failCurrentStatement).toHaveBeenCalledOnce();
    expect(store.failCurrentStatement).toHaveBeenCalledWith("I ", 1);
    expect(store.passCurrentStatement).not.toHaveBeenCalled();
    expect((input.element as HTMLInputElement).value).toBe("");
  });

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
    await press("Enter", { isComposing: true });
    await press("Enter", { keyCode: 229 });
    await press("Space", { repeat: true });
    await press("Enter", { repeat: true });
    expect(useCorrectSound().playCorrectSound).not.toHaveBeenCalled();
    expect(useWordAudio().playAutoWordAudio).not.toHaveBeenCalled();
    expect(useWordAudio().playAutoSentenceAudio).not.toHaveBeenCalled();
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
