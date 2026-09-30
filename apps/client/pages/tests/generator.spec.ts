import { mountSuspended } from "@nuxt/test-utils/runtime";
import { flushPromises } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";

import Generator from "../generator.vue";

describe("generator capture mode", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("checks the local generator service when capture mode opens", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ runtimeReady: true, modelDownloaded: true }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const wrapper = await mountSuspended(Generator, {
      route: "/generator?capture=0123456789abcdef0123456789abcdef",
    });
    await flushPromises();

    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:8765/api/status",
      expect.objectContaining({ targetAddressSpace: "loopback" }),
    );
    expect(wrapper.text()).toContain("本地服务和翻译模型已就绪。");
    wrapper.unmount();
  });
});
