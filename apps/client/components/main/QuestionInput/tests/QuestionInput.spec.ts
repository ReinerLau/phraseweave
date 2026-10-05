import { createTestingPinia } from "@pinia/testing";
import { enableAutoUnmount, mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useAnswerTip } from "~/composables/main/answerTip";
import { useExerciseStore } from "~/store/exercise";
import QuestionInput from "../QuestionInput.vue";

enableAutoUnmount(afterEach);

describe("QuestionInput", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useAnswerTip().hiddenAnswerTip();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  function mountQuestionInput(english = "I eat") {
    const pinia = createTestingPinia({ createSpy: vi.fn });
    const courseStore = useExerciseStore(pinia);
    courseStore.currentStatement = {
      id: "1",
      order: 1,
      english,
      chinese: "我吃",
      soundmark: "/aɪ iːt/",
    };

    const wrapper = mount(QuestionInput, {
      global: {
        plugins: [pinia],
      },
    });

    return { input: wrapper.get('input[type="text"]'), wrapper };
  }

  async function submitAnswer(
    input: ReturnType<typeof mountQuestionInput>["input"],
    value: string,
  ) {
    (input.element as HTMLInputElement).focus();
    await input.setValue(value);
    await input.trigger("keydown", { code: "Enter", key: "Enter" });
  }

  it("shows an incorrect answer briefly before resetting the input", async () => {
    const { input, wrapper } = mountQuestionInput();
    await wrapper.vm.$nextTick();

    await submitAnswer(input, "I like");
    await wrapper.vm.$nextTick();

    expect((input.element as HTMLInputElement).value).not.toBe("");
    expect(wrapper.findAll(".question-input-word")).toHaveLength(2);
    expect(wrapper.findAll(".question-input-word.border-b-red-500")).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(299);
    expect((input.element as HTMLInputElement).value).not.toBe("");

    await vi.advanceTimersByTimeAsync(1);
    await wrapper.vm.$nextTick();

    expect((input.element as HTMLInputElement).value).toBe("");
    expect(wrapper.findAll(".question-input-word.border-b-red-500")).toHaveLength(0);
    expect(wrapper.find(".question-input-word").classes()).toContain("border-b-fuchsia-500");
  });

  it("replaces a pending reset for a newer incorrect answer", async () => {
    const { input, wrapper } = mountQuestionInput();
    await wrapper.vm.$nextTick();

    await submitAnswer(input, "I like");
    await wrapper.vm.$nextTick();
    await vi.advanceTimersByTimeAsync(200);

    await submitAnswer(input, "I love");
    await wrapper.vm.$nextTick();
    await vi.advanceTimersByTimeAsync(200);

    expect((input.element as HTMLInputElement).value).not.toBe("");

    await vi.advanceTimersByTimeAsync(100);
    await wrapper.vm.$nextTick();
    expect((input.element as HTMLInputElement).value).toBe("");
  });

  it("cancels a pending reset after a correct answer", async () => {
    const { input, wrapper } = mountQuestionInput();
    await wrapper.vm.$nextTick();

    await submitAnswer(input, "I like");
    await wrapper.vm.$nextTick();
    await submitAnswer(input, "I eat");
    await wrapper.vm.$nextTick();

    expect(vi.getTimerCount()).toBe(0);
  });

  it("cleans up a pending reset when unmounted", async () => {
    const { input, wrapper } = mountQuestionInput();
    await wrapper.vm.$nextTick();

    await submitAnswer(input, "I like");
    await wrapper.vm.$nextTick();
    expect(vi.getTimerCount()).toBe(1);

    wrapper.unmount();

    expect(vi.getTimerCount()).toBe(0);
  });

  it("keeps the answer tip for Han input and hides it for symbols or digits", async () => {
    const { input, wrapper } = mountQuestionInput("S$500");
    const { showAnswerTip, isAnswerTip } = useAnswerTip();
    showAnswerTip();
    await wrapper.vm.$nextTick();

    await input.setValue("中");
    expect(isAnswerTip()).toBe(true);
    expect((input.element as HTMLInputElement).value).toBe("");

    await input.setValue("$");
    expect(isAnswerTip()).toBe(false);
    expect((input.element as HTMLInputElement).value).toBe("$");

    showAnswerTip();
    await wrapper.vm.$nextTick();
    await input.setValue("5");
    expect(isAnswerTip()).toBe(false);
    expect((input.element as HTMLInputElement).value).toBe("5");

    await submitAnswer(input, "S$500");
  });

  it("keeps the original sentence punctuation visible before input, in tips, and after input", async () => {
    const sentence =
      "The new penalties will also be applied to other anti-social behaviour, such as putting feet on seats, littering, and eating or drinking on buses";
    const { input, wrapper } = mountQuestionInput(sentence);
    await wrapper.vm.$nextTick();
    const punctuation = () => wrapper.findAll(".cloze-punctuation").map((part) => part.text());
    expect(punctuation()).toEqual(["-", ",", ",", ","]);
    expect(wrapper.findAll(".question-input-word")).toHaveLength(25);
    expect(wrapper.findAll(".cloze-punctuation.border-b-2")).toHaveLength(0);
    expect(
      wrapper.findAll(".question-input-group")[9].findAll(".question-input-word"),
    ).toHaveLength(2);

    const { showAnswerTip, isAnswerTip } = useAnswerTip();
    showAnswerTip();
    await wrapper.vm.$nextTick();
    expect(
      wrapper
        .findAll(".question-input-word")
        .map((part) => part.text())
        .slice(9, 12),
    ).toEqual(["anti", "social", "behaviour"]);
    await input.setValue(",.-");
    expect(isAnswerTip()).toBe(true);
    expect((input.element as HTMLInputElement).value).toBe("");

    await input.setValue(sentence);
    expect(isAnswerTip()).toBe(false);
    expect((input.element as HTMLInputElement).value).toBe(
      sentence.replace("-", " ").replaceAll(",", ""),
    );
    expect(punctuation()).toEqual(["-", ",", ",", ","]);
    await input.trigger("keydown", { code: "Enter", key: "Enter" });
    expect(useExerciseStore().passCurrentStatement).toHaveBeenCalledOnce();
    expect(useExerciseStore().failCurrentStatement).not.toHaveBeenCalled();
  });

  it("keeps an apostrophe while a contraction is being typed", async () => {
    const { input } = mountQuestionInput("don’t");
    await input.setValue("don'");
    expect((input.element as HTMLInputElement).value).toBe("don'");
    await submitAnswer(input, "don't");
    expect(useExerciseStore().passCurrentStatement).toHaveBeenCalledOnce();
  });
});
