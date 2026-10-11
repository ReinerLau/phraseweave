import { createTestingPinia } from "@pinia/testing";
import { enableAutoUnmount, flushPromises, mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import QuestionInput from "~/components/main/QuestionInput/QuestionInput.vue";
import SpeakableText from "~/components/SpeakableText.vue";
import { useAnswerTip } from "~/composables/main/answerTip";
import {
  clearWordAudioCache,
  disposeWordAudio,
  playWordAudio,
  stopWordAudio,
  useWordAudio,
} from "~/composables/useWordAudio";
import { deleteWordAudioCache, fetchWordAudio } from "~/services/wordAudio";
import { useExerciseStore } from "~/store/exercise";

vi.mock("~/services/wordAudio", async (original) => ({
  ...(await original<typeof import("~/services/wordAudio")>()),
  fetchWordAudio: vi.fn(),
  deleteWordAudioCache: vi.fn().mockResolvedValue(undefined),
}));

enableAutoUnmount(afterEach);
let media: {
  src: string;
  play: ReturnType<typeof vi.fn>;
  pause: ReturnType<typeof vi.fn>;
  load: ReturnType<typeof vi.fn>;
  removeAttribute: ReturnType<typeof vi.fn>;
  onended: (() => void) | null;
  onerror: (() => void) | null;
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

beforeEach(() => {
  vi.clearAllMocks();
  media = {
    src: "",
    play: vi.fn().mockResolvedValue(undefined),
    pause: vi.fn(),
    load: vi.fn(),
    removeAttribute: vi.fn(),
    onended: null,
    onerror: null,
  };
  vi.stubGlobal(
    "Audio",
    class {
      constructor() {
        return media;
      }
    },
  );
  vi.stubGlobal("URL", { createObjectURL: vi.fn(() => "blob:word"), revokeObjectURL: vi.fn() });
  vi.mocked(fetchWordAudio).mockResolvedValue(new Blob(["audio"], { type: "audio/mpeg" }));
  useAnswerTip().hiddenAnswerTip();
});

afterEach(() => {
  disposeWordAudio();
  delete (document as Partial<Document>).elementsFromPoint;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("word audio playback", () => {
  it("only plays the latest click and discards late responses", async () => {
    const first = deferred<Blob>();
    const second = deferred<Blob>();
    vi.mocked(fetchWordAudio)
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const element = document.createElement("span");
    const old = playWordAudio("hello", element);
    const oldSignal = vi.mocked(fetchWordAudio).mock.calls[0][1];
    const latest = playWordAudio("world", element);
    expect(oldSignal.aborted).toBe(true);
    second.resolve(new Blob(["latest"]));
    await latest;
    first.resolve(new Blob(["old"]));
    await old;
    expect(URL.createObjectURL).toHaveBeenCalledOnce();
    expect(media.src).toBe("blob:word");
    expect(useWordAudio().loadingElement.value).toBeUndefined();
  });

  it("stops requests and releases audio on navigation", async () => {
    const pending = deferred<Blob>();
    vi.mocked(fetchWordAudio).mockReturnValueOnce(pending.promise);
    const active = playWordAudio("hello", document.createElement("span"));
    const signal = vi.mocked(fetchWordAudio).mock.calls[0][1];
    stopWordAudio();
    pending.resolve(new Blob(["audio"]));
    await active;
    expect(signal.aborted).toBe(true);
    expect(URL.createObjectURL).not.toHaveBeenCalled();
    await playWordAudio("hello", document.createElement("span"));
    media.onended?.();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:word");
  });

  it("reports failures and allows another click to retry", async () => {
    vi.mocked(fetchWordAudio).mockRejectedValueOnce(new Error("offline"));
    const element = document.createElement("span");
    await playWordAudio("hello", element);
    expect(useWordAudio().audioError.value).toBe("offline");
    await playWordAudio("hello", element);
    expect(useWordAudio().audioError.value).toBe("");
    media.onerror?.();
    expect(useWordAudio().audioError.value).toContain("播放失败");
  });

  it("replays the same word and stops before clearing its persistent cache", async () => {
    const element = document.createElement("span");
    await playWordAudio("hello", element);
    await playWordAudio("hello", element);
    expect(fetchWordAudio).toHaveBeenCalledTimes(2);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:word");
    await clearWordAudioCache();
    expect(deleteWordAudioCache).toHaveBeenCalledOnce();
    expect(useWordAudio().loadingElement.value).toBeUndefined();
  });
});

describe("visible word interaction", () => {
  it("preserves whitespace and punctuation, including apostrophes and acronyms", async () => {
    const text = " NASA: don’t  panic.\nUS!";
    const wrapper = mount(SpeakableText, { props: { text } });
    expect(wrapper.element.textContent).toBe(text);
    expect(wrapper.findAll('[role="button"]').map((word) => word.text())).toEqual([
      "NASA",
      "don’t",
      "panic",
      "US",
    ]);
    await wrapper.get('[aria-label="朗读 don’t"]').trigger("click");
    await flushPromises();
    expect(fetchWordAudio).toHaveBeenCalledWith("don’t", expect.any(AbortSignal));
    await wrapper.get('[aria-label="朗读 NASA"]').trigger("keydown", { key: "Enter" });
    expect(vi.mocked(fetchWordAudio).mock.calls.at(-1)?.[0]).toBe("NASA");
  });

  it("shows loading only on the clicked word", async () => {
    const pending = deferred<Blob>();
    vi.mocked(fetchWordAudio).mockReturnValueOnce(pending.promise);
    const wrapper = mount(SpeakableText, { props: { text: "hello world" } });
    await wrapper.get('[aria-label="朗读 world"]').trigger("click");
    expect(wrapper.findAll('[aria-busy="true"]').map((word) => word.text())).toEqual(["world"]);
    pending.resolve(new Blob(["audio"]));
    await flushPromises();
    expect(wrapper.find('[aria-busy="true"]').exists()).toBe(false);
  });

  it("hit-tests beneath the input, reads only visible text and keeps its caret", async () => {
    const pinia = createTestingPinia({ createSpy: vi.fn });
    useExerciseStore(pinia).currentStatement = { id: "1", order: 1, english: "hello world" };
    const wrapper = mount(QuestionInput, { attachTo: document.body, global: { plugins: [pinia] } });
    const input = wrapper.get("input");
    const words = wrapper.findAll(".question-input-word");
    const hitTest = vi.fn().mockReturnValue([input.element, words[0].element]);
    Object.defineProperty(document, "elementsFromPoint", { configurable: true, value: hitTest });
    await input.trigger("click", { clientX: 10, clientY: 10 });
    expect(fetchWordAudio).not.toHaveBeenCalled();
    await input.setValue("hell");
    const element = input.element as HTMLInputElement;
    element.focus();
    element.setSelectionRange(2, 2);
    await input.trigger("mousedown", { clientX: 10, clientY: 10 });
    await input.trigger("click", { clientX: 10, clientY: 10 });
    expect(fetchWordAudio).toHaveBeenCalledWith("hell", expect.any(AbortSignal));
    expect(document.activeElement).toBe(element);
    expect(element.selectionStart).toBe(2);
    hitTest.mockReturnValue([input.element, words[1].element]);
    await input.trigger("click", { clientX: 10, clientY: 10 });
    expect(fetchWordAudio).toHaveBeenCalledTimes(1);
    useAnswerTip().showAnswerTip();
    await wrapper.vm.$nextTick();
    await input.trigger("click", { clientX: 10, clientY: 10 });
    expect(vi.mocked(fetchWordAudio).mock.calls.at(-1)?.[0]).toBe("world");
    await input.setValue("world");
    expect(useAnswerTip().isAnswerTip()).toBe(false);
  });
});
