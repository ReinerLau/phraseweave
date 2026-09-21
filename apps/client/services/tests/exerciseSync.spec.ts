import { describe, expect, it, vi } from "vitest";

import type { ExerciseResponse } from "~/api/exercise";
import { createExerciseSyncUrl, createSenderSession, getSignalUrl } from "../exerciseSync";

const { runtimeConfig, useRuntimeConfigMock } = vi.hoisted(() => {
  const runtimeConfig = {
    app: { baseURL: "/" },
    public: { exerciseSyncSignalUrl: "" },
  };

  return { runtimeConfig, useRuntimeConfigMock: vi.fn(() => runtimeConfig) };
});

vi.mock("nuxt/app", () => ({
  useRuntimeConfig: useRuntimeConfigMock,
}));

describe("exercise sync service", () => {
  it("creates a browser link for the receive page", () => {
    const url = createExerciseSyncUrl("room-token");

    expect(url).toContain("/receive?room=room-token");
    expect(useRuntimeConfigMock).toHaveBeenCalled();
  });

  it.each(["https://signal.example.workers.dev", "https://signal.example.workers.dev/room"])(
    "builds a WebSocket URL with the worker room path from %s",
    (configuredUrl) => {
      runtimeConfig.public.exerciseSyncSignalUrl = configuredUrl;

      expect(getSignalUrl("room-token")).toBe("wss://signal.example.workers.dev/room/room-token");
    },
  );

  it("retries a transient signaling failure before reporting an error", async () => {
    vi.useFakeTimers();
    const updates: Array<{ status: string; message?: string }> = [];
    const webSockets: FakeWebSocket[] = [];
    const failuresBeforeOpen = 1;

    vi.stubGlobal(
      "WebSocket",
      class extends FakeWebSocket {
        constructor(url: string) {
          super(url, webSockets, failuresBeforeOpen);
        }
      },
    );
    vi.stubGlobal("RTCPeerConnection", FakeRTCPeerConnection);
    runtimeConfig.public.exerciseSyncSignalUrl = "https://signal.example.workers.dev";

    await createSenderSession("a".repeat(64), {} as ExerciseResponse, (update) =>
      updates.push(update),
    );
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(500);
    await Promise.resolve();

    expect(webSockets).toHaveLength(2);
    expect(updates.at(-1)).toMatchObject({ status: "waiting" });
    expect(updates.some((update) => update.status === "error")).toBe(false);

    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("reports an error after signaling retries are exhausted", async () => {
    vi.useFakeTimers();
    const updates: Array<{ status: string; message?: string }> = [];
    const webSockets: FakeWebSocket[] = [];
    const failuresBeforeOpen = 4;

    vi.stubGlobal(
      "WebSocket",
      class extends FakeWebSocket {
        constructor(url: string) {
          super(url, webSockets, failuresBeforeOpen);
        }
      },
    );
    vi.stubGlobal("RTCPeerConnection", FakeRTCPeerConnection);
    runtimeConfig.public.exerciseSyncSignalUrl = "https://signal.example.workers.dev";

    await createSenderSession("b".repeat(64), {} as ExerciseResponse, (update) =>
      updates.push(update),
    );
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(500);
    await vi.advanceTimersByTimeAsync(1_000);
    await vi.advanceTimersByTimeAsync(2_000);
    await Promise.resolve();

    expect(webSockets).toHaveLength(4);
    expect(updates.at(-1)).toEqual({
      status: "error",
      message: "无法连接练习同步服务",
    });

    vi.useRealTimers();
    vi.unstubAllGlobals();
  });
});

class FakeWebSocket {
  static readonly OPEN = 1;
  readyState = 0;
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;

  constructor(
    readonly url: string,
    private readonly instances: FakeWebSocket[],
    private readonly failuresBeforeOpen: number,
  ) {
    instances.push(this);
    queueMicrotask(() => {
      if (instances.length <= failuresBeforeOpen) {
        this.onerror?.(new Event("error"));
        this.onclose?.(new CloseEvent("close"));
        return;
      }

      this.readyState = FakeWebSocket.OPEN;
      this.onopen?.(new Event("open"));
    });
  }

  send() {}

  close() {
    this.readyState = 3;
  }
}

class FakeRTCPeerConnection {
  onicecandidate: ((event: RTCPeerConnectionIceEvent) => void) | null = null;

  createDataChannel() {
    return {
      binaryType: "",
      bufferedAmount: 0,
      onopen: null,
      send() {},
    };
  }

  close() {}
}
