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
  });
  afterEach(() => {
    localStorage.removeItem("wordSpaceCheck");
  });

  it("defaults off, persists across mounts, and documents the new key mapping", async () => {
    let wrapper = mount(Setting);
    const experimental = wrapper.get<HTMLInputElement>("#word-space-check");
    const section = wrapper
      .findAll("section")
      .find((section) => section.text().includes("答题设置"))!;
    expect(experimental.element.checked).toBe(false);
    expect(section.text()).not.toContain("开启空格提交答案");
    await experimental.setValue(true);
    expect(section.text()).toContain(
      "空格确认当前词元；回车只用于回退；整句答对后按空格进入下一题",
    );
    expect(localStorage.getItem("wordSpaceCheck")).toBe("true");
    wrapper.unmount();
    wrapper = mount(Setting);
    expect(wrapper.get<HTMLInputElement>("#word-space-check").element.checked).toBe(true);
    await wrapper.get("#word-space-check").setValue(false);
    expect(localStorage.getItem("wordSpaceCheck")).toBe("false");
  });
});
