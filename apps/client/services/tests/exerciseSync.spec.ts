import { describe, expect, it, vi } from "vitest";

import { createExerciseSyncUrl } from "../exerciseSync";

const useRuntimeConfigMock = vi.hoisted(() =>
  vi.fn(() => ({
    app: { baseURL: "/" },
    public: { exerciseSyncSignalUrl: "" },
  })),
);

vi.mock("nuxt/app", () => ({
  useRuntimeConfig: useRuntimeConfigMock,
}));

describe("exercise sync service", () => {
  it("creates a browser link for the receive page", () => {
    const url = createExerciseSyncUrl("room-token");

    expect(url).toContain("/receive?room=room-token");
    expect(useRuntimeConfigMock).toHaveBeenCalled();
  });
});
