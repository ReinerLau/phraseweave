import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent } from "vue";

import { useTtsStatus } from "~/composables/useTtsStatus";
import { getTtsStatus, retryTts } from "~/services/wordAudio";

vi.mock("~/services/wordAudio", () => ({ getTtsStatus: vi.fn(), retryTts: vi.fn() }));

let state: ReturnType<typeof useTtsStatus>;
let wrapper: ReturnType<typeof mount>;
const View = defineComponent({
  setup() {
    state = useTtsStatus();
    return () => null;
  },
});

beforeEach(() => {
  vi.useFakeTimers();
  vi.resetAllMocks();
});
afterEach(() => {
  wrapper?.unmount();
  vi.useRealTimers();
});

describe("local TTS preparation", () => {
  it("polls preparation until ready and stops when the view closes", async () => {
    vi.mocked(getTtsStatus)
      .mockResolvedValueOnce({ state: "downloading", message: "Downloading" })
      .mockResolvedValueOnce({ state: "loading", message: "Loading" })
      .mockResolvedValue({ state: "ready", message: "Ready" });
    wrapper = mount(View);
    await flushPromises();
    expect(state.status.value.state).toBe("downloading");
    await vi.advanceTimersByTimeAsync(2000);
    expect(state.status.value.state).toBe("loading");
    await vi.advanceTimersByTimeAsync(2000);
    expect(state.status.value.state).toBe("ready");
    await vi.advanceTimersByTimeAsync(4000);
    expect(getTtsStatus).toHaveBeenCalledTimes(3);
    wrapper.unmount();
    expect(vi.mocked(getTtsStatus).mock.calls[2][0]?.aborted).toBe(true);
  });

  it("does not poll errors, retries once, and resumes preparation polling", async () => {
    vi.mocked(getTtsStatus).mockResolvedValue({ state: "error", message: "Load failed" });
    vi.mocked(retryTts).mockResolvedValue({ state: "starting", message: "Starting" });
    wrapper = mount(View);
    await flushPromises();
    await vi.advanceTimersByTimeAsync(4000);
    expect(getTtsStatus).toHaveBeenCalledTimes(1);
    await Promise.all([state.retry(), state.retry()]);
    expect(retryTts).toHaveBeenCalledTimes(1);
    expect(state.status.value.state).toBe("starting");
    vi.mocked(getTtsStatus).mockResolvedValue({ state: "ready", message: "Ready" });
    await vi.advanceTimersByTimeAsync(2000);
    expect(state.status.value.state).toBe("ready");
  });

  it("cancels polling and ignores late responses after unmount", async () => {
    let resolve!: (value: Awaited<ReturnType<typeof getTtsStatus>>) => void;
    vi.mocked(getTtsStatus).mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    wrapper = mount(View);
    const signal = vi.mocked(getTtsStatus).mock.calls[0][0];
    wrapper.unmount();
    expect(signal?.aborted).toBe(true);
    resolve({ state: "downloading", message: "Late response" });
    await flushPromises();
    await vi.advanceTimersByTimeAsync(4000);
    expect(getTtsStatus).toHaveBeenCalledTimes(1);
    expect(state.status.value.state).toBe("starting");
  });

  it("surfaces connection errors and stops pending polling on unmount", async () => {
    vi.mocked(getTtsStatus).mockRejectedValue(new Error("无法连接朗读服务"));
    wrapper = mount(View);
    await flushPromises();
    expect(state.status.value.message).toBe("无法连接朗读服务");
    expect(state.status.value.state).toBe("error");
    vi.mocked(retryTts).mockResolvedValue({ state: "downloading", message: "Downloading" });
    await state.retry();
    wrapper.unmount();
    await vi.advanceTimersByTimeAsync(4000);
    expect(getTtsStatus).toHaveBeenCalledTimes(1);
  });
});
