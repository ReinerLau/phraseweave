import { enableAutoUnmount, mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";

import Setting from "../Setting.vue";

vi.mock("~/composables/useTtsStatus", () => ({
  useTtsStatus: () => ({
    status: { state: "ready", message: "准备完成" },
    retrying: false,
    retry: vi.fn(),
  }),
}));

enableAutoUnmount(afterEach);

describe("practice settings", () => {
  it("keeps auto advance while hiding the legacy word-check switch", () => {
    localStorage.setItem("wordSpaceCheck", "false");
    const wrapper = mount(Setting);
    const section = wrapper.findAll("section").find((item) => item.text().includes("答题设置"))!;
    expect(section.text()).toContain("答题正确后自动下一题");
    expect(wrapper.find("#word-space-check").exists()).toBe(false);
    expect(localStorage.getItem("wordSpaceCheck")).toBe("false");
    localStorage.removeItem("wordSpaceCheck");
  });
});
