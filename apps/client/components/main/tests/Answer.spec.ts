import { createTestingPinia } from "@pinia/testing";
import { mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useExerciseStore } from "~/store/exercise";
import Answer from "../Answer.vue";

const { handlePlayWordSound, playSound } = vi.hoisted(() => ({
  handlePlayWordSound: vi.fn(),
  playSound: vi.fn(),
}));

vi.mock("~/composables/main/englishSound", () => ({
  useCurrentStatementEnglishSound: () => ({ playSound }),
}));

vi.mock("~/composables/main/englishSound/audio", () => ({
  usePlayWordSound: () => ({ handlePlayWordSound }),
}));

vi.mock("~/composables/main/game", () => ({
  useGameMode: () => ({ showQuestion: vi.fn() }),
}));

vi.mock("~/composables/main/summary", () => ({
  useSummary: () => ({ showSummary: vi.fn() }),
}));

vi.mock("~/composables/user/sound", () => ({
  useAutoPronunciation: () => ({ isAutoPlaySound: () => false }),
}));

vi.mock("~/utils/keyboardShortcuts", () => ({
  cancelShortcut: vi.fn(),
  registerShortcut: vi.fn(),
}));

describe("Answer", () => {
  beforeEach(() => {
    handlePlayWordSound.mockClear();
    playSound.mockClear();
  });

  it("removes the standalone audio button and keeps word playback", async () => {
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
      chinese: "我喜欢",
      soundmark: "/aɪ laɪk/",
    };
    await wrapper.vm.$nextTick();

    expect(wrapper.find(".i-ph-speaker-simple-high").exists()).toBe(false);
    expect(wrapper.text()).not.toContain("再来一次");
    expect(wrapper.text()).toContain("下一题");

    await wrapper.find("span").trigger("click");
    expect(handlePlayWordSound).toHaveBeenCalledWith("I");
  });
});
