import { createTestingPinia } from "@pinia/testing";
import { mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";

import { useExerciseStore } from "~/store/exercise";
import Answer from "../Answer.vue";

vi.mock("~/composables/main/game", () => ({
  useGameMode: () => ({ showQuestion: vi.fn() }),
}));

vi.mock("~/composables/main/summary", () => ({
  useSummary: () => ({ showSummary: vi.fn() }),
}));

vi.mock("~/utils/keyboardShortcuts", () => ({
  cancelShortcut: vi.fn(),
  registerShortcut: vi.fn(),
}));

describe("Answer", () => {
  it("shows the sentence prompt and the completed English sentence", async () => {
    const wrapper = mount(Answer, {
      global: {
        plugins: [createTestingPinia({ createSpy: vi.fn })],
      },
    });
    const courseStore = useExerciseStore();
    courseStore.currentStatement = {
      id: "1",
      order: 1,
      english: "I like",
      sentenceChinese: "我喜欢它。",
      contextBefore: "Today ",
      contextAfter: " it.",
    };
    await wrapper.vm.$nextTick();

    expect(wrapper.text()).not.toContain("再来一次");
    expect(wrapper.text()).not.toContain("下一题");
    expect(wrapper.findAll("button")).toHaveLength(0);
    expect(wrapper.get('[data-testid="answer-prompt"]').text()).toBe("我喜欢它。");
    const sentence = wrapper.get('[data-testid="answer-sentence"]');
    expect(sentence.findAll(".cloze-context").map((part) => part.text())).toEqual(["Today", "it."]);
    expect(sentence.findAll(".question-input-word").map((word) => word.text())).toEqual([
      "I",
      "like",
    ]);
  });

  it("shares the input layout and displays fixed punctuation around editable words", async () => {
    const wrapper = mount(Answer, {
      global: { plugins: [createTestingPinia({ createSpy: vi.fn })] },
    });
    useExerciseStore().currentStatement = {
      id: "punctuation",
      order: 1,
      english: "“don’t” be anti-social, please...",
    };
    await wrapper.vm.$nextTick();
    expect(wrapper.findAll(".question-input-word").map((word) => word.text())).toEqual([
      "don’t",
      "be",
      "anti",
      "social",
      "please",
    ]);
    expect(wrapper.findAll(".cloze-punctuation").map((part) => part.text())).toEqual([
      "“",
      "”",
      "-",
      ",",
      "...",
    ]);
    expect(wrapper.findAll(".question-input-group").map((group) => group.text())).toEqual([
      "“don’t”",
      "be",
      "anti-social,",
      "please...",
    ]);
  });
});
