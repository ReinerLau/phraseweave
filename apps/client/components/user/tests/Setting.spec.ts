import { enableAutoUnmount, mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import Setting from "../Setting.vue";

vi.mock("~/composables/useTtsStatus", () => ({
  useTtsStatus: () => ({
    status: { state: "ready", message: "准备完成" },
    retrying: false,
    retry: vi.fn(),
  }),
}));

enableAutoUnmount(afterEach);

describe("experimental word space checking setting", () => {
  beforeEach(() => {
    localStorage.removeItem("wordSpaceCheck");
    localStorage.setItem("spaceSubmitAnswer", "true");
  });
  afterEach(() => {
    localStorage.removeItem("wordSpaceCheck");
    localStorage.removeItem("spaceSubmitAnswer");
  });

  it("defaults off, persists across mounts, and preserves the legacy space-submit preference", async () => {
    let wrapper = mount(Setting);
    const experimental = wrapper.get<HTMLInputElement>("#word-space-check");
    const section = wrapper
      .findAll("section")
      .find((section) => section.text().includes("答题设置"))!;
    const legacy = section.findAll<HTMLInputElement>("input")[1];
    expect(experimental.element.checked).toBe(false);
    expect(legacy.element.disabled).toBe(false);
    expect(legacy.element.checked).toBe(true);
    await experimental.setValue(true);
    expect(section.text()).toContain("空格确认当前词元，回车表示不会并回退");
    expect(legacy.element.disabled).toBe(true);
    expect(localStorage.getItem("wordSpaceCheck")).toBe("true");
    wrapper.unmount();
    wrapper = mount(Setting);
    expect(wrapper.get<HTMLInputElement>("#word-space-check").element.checked).toBe(true);
    await wrapper.get("#word-space-check").setValue(false);
    expect(localStorage.getItem("spaceSubmitAnswer")).toBe("true");
    expect(
      wrapper.findAll("section")[2].findAll<HTMLInputElement>("input")[1].element.disabled,
    ).toBe(false);
  });
});
