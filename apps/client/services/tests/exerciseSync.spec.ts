import { describe, expect, it, vi } from "vitest";

import { createExerciseSyncUrl, getSignalUrl } from "../exerciseSync";

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
});
