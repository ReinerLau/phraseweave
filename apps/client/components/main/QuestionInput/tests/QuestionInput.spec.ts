import { createTestingPinia } from "@pinia/testing";
import { mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useExerciseStore } from "~/store/exercise";
import QuestionInput from "../QuestionInput.vue";

const { playErrorSound, playRightSound, playTypingSound } = vi.hoisted(() => ({
  playErrorSound: vi.fn(),
  playRightSound: vi.fn(),
  playTypingSound: vi.fn(),
}));

vi.mock("../useTypingSound", () => ({
  usePlayTipSound: () => ({ playErrorSound, playRightSound }),
  useTypingSound: () => ({
    checkPlayTypingSound: () => false,
    playTypingSound,
  }),
}));

describe("QuestionInput", () => {
  beforeEach(() => {
    playErrorSound.mockClear();
    playRightSound.mockClear();
    playTypingSound.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("clears an incorrect answer and resets the error styles", async () => {
    const pinia = createTestingPinia({ createSpy: vi.fn });
    const courseStore = useExerciseStore(pinia);
    courseStore.currentStatement = {
      id: "1",
      order: 1,
      english: "I eat",
      chinese: "我吃",
      soundmark: "/aɪ iːt/",
    };

    const wrapper = mount(QuestionInput, {
      global: {
        plugins: [pinia],
      },
    });

    const input = wrapper.get('input[type="text"]');
    await wrapper.vm.$nextTick();

    (input.element as HTMLInputElement).focus();
    await input.setValue("I like");
    await input.trigger("keydown", { code: "Enter", key: "Enter" });
    await wrapper.vm.$nextTick();

    expect(playErrorSound).toHaveBeenCalledOnce();
    expect((input.element as HTMLInputElement).value).toBe("");
    expect(wrapper.findAll(".question-input-word")).toHaveLength(2);
    expect(wrapper.findAll(".question-input-word.border-b-red-500")).toHaveLength(0);
    expect(wrapper.find(".question-input-word").classes()).toContain("border-b-fuchsia-500");
  });
});
