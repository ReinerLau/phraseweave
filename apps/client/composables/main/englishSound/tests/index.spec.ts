import { createTestingPinia } from "@pinia/testing";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useExerciseStore } from "~/store/exercise";
import { play, updateSource } from "../audio";
import { useCurrentStatementEnglishSound } from "../index";

vi.mock("../audio.ts", () => {
  return {
    updateSource: vi.fn(),
    play: vi.fn(),
  };
});

describe("useCurrentStatementEnglishSound", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    createTestingPinia({
      createSpy: vi.fn,
    });

    const courseStore = useExerciseStore();
    courseStore.currentStatement = {
      id: "1",
      order: 1,
      english: "I",
      soundmark: "/I/",
      chinese: "我",
    };

    vi.clearAllMocks();
  });

  it("does not play sound while Youdao pronunciation is disabled", async () => {
    const { playSound } = useCurrentStatementEnglishSound();

    playSound();

    expect(play).not.toHaveBeenCalled();
  });

  it("does not update audio source while Youdao pronunciation is disabled", async () => {
    useCurrentStatementEnglishSound();

    // update english value
    const courseStore = useExerciseStore();
    courseStore.currentStatement = {
      id: "2",
      order: 2,
      english: "like",
      soundmark: "/like/",
      chinese: "喜欢",
    };
    await vi.advanceTimersToNextTimerAsync();

    expect(updateSource).not.toHaveBeenCalled();
  });

  it("does not update audio source if the word is the same", async () => {
    useCurrentStatementEnglishSound();

    const courseStore = useExerciseStore();
    courseStore.currentStatement = {
      id: "1",
      order: 1,
      english: "I",
      soundmark: "/I/",
      chinese: "我",
    };

    expect(updateSource).not.toHaveBeenCalled();
  });
});
