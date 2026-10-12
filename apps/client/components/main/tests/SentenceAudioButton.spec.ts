import { createTestingPinia } from "@pinia/testing";
import { enableAutoUnmount, mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";

import SentenceAudioButton from "~/components/main/SentenceAudioButton.vue";
import { useGameMode } from "~/composables/main/game";
import { useSummary } from "~/composables/main/summary";
import { useWordAudio } from "~/composables/useWordAudio";
import { useExerciseStore } from "~/store/exercise";

vi.mock("~/composables/useWordAudio", () => {
  const activeSentence = ref<string>();
  const loadingElement = ref<HTMLElement>();
  const playSentenceAudio = vi.fn();
  return { useWordAudio: () => ({ activeSentence, loadingElement, playSentenceAudio }) };
});
enableAutoUnmount(afterEach);

beforeEach(() => {
  useSummary().hideSummary();
  useWordAudio().activeSentence.value = undefined;
  vi.clearAllMocks();
});

describe("original sentence audio button", () => {
  function setup() {
    const pinia = createTestingPinia({ createSpy: vi.fn });
    const store = useExerciseStore(pinia);
    store.currentStatement = {
      id: "word",
      order: 1,
      english: "computer",
      contextBefore: "I use a ",
      contextAfter: " every day.",
    };
    return { store, wrapper: mount(SentenceAudioButton, { global: { plugins: [pinia] } }) };
  }

  it("reads the complete source in both question and answer states", async () => {
    const { wrapper, store } = setup();
    useGameMode().showQuestion();
    await wrapper.get("button").trigger("click");
    expect(useWordAudio().playSentenceAudio).toHaveBeenCalledWith(
      "I use a computer every day.",
      wrapper.element,
    );
    useGameMode().showAnswer();
    await wrapper.vm.$nextTick();
    expect(wrapper.get("button").attributes("aria-label")).toBe("朗读原句");
    store.currentStatement = { id: "old", order: 1, english: "Hello world." };
    await wrapper.vm.$nextTick();
    expect(store.originalSentence).toBe("Hello world.");
    await wrapper.get("button").trigger("click");
    expect(useWordAudio().playSentenceAudio).toHaveBeenLastCalledWith(
      "Hello world.",
      wrapper.element,
    );
  });

  it("offers stop during playback and disappears at settlement", async () => {
    const { wrapper, store } = setup();
    useWordAudio().activeSentence.value = store.originalSentence;
    await wrapper.vm.$nextTick();
    expect(wrapper.get("button").attributes("aria-label")).toBe("停止朗读");
    useSummary().showSummary();
    await wrapper.vm.$nextTick();
    expect(wrapper.find("button").exists()).toBe(false);
  });
});
