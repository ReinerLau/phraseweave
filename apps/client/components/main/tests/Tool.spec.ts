import { createTestingPinia } from "@pinia/testing";
import { enableAutoUnmount, mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";

import { practiceModeAvailability } from "~/utils/practiceModes";
import Tool from "../Tool.vue";

vi.mock("~/components/main/QuestionInput/questionInputHelper", () => ({
  useQuestionInput: () => ({ focusInput: vi.fn() }),
}));

enableAutoUnmount(afterEach);
afterEach(() => {
  practiceModeAvailability.progressive = false;
  practiceModeAvailability.single = false;
});

function mountTool() {
  return mount(Tool, {
    global: {
      plugins: [createTestingPinia({ createSpy: vi.fn })],
      stubs: {
        NuxtLink: { template: '<a href="/course-pack"><slot /></a>' },
        IconsExpand: true,
        MainContents: true,
        MainMessageBox: true,
        LearningModeSwitch: true,
        PracticeViewSwitch: true,
      },
    },
  });
}

describe("practice toolbar mode availability", () => {
  it("hides both mode selectors and keeps the return link", () => {
    const wrapper = mountTool();
    expect(wrapper.find("learning-mode-switch-stub").exists()).toBe(false);
    expect(wrapper.find("practice-view-switch-stub").exists()).toBe(false);
    expect(wrapper.find('a[href="/course-pack"]').exists()).toBe(true);
  });

  it.each(["progressive", "single"] as const)(
    "can restore the %s selector independently",
    (mode) => {
      practiceModeAvailability[mode] = true;
      const wrapper = mountTool();
      expect(wrapper.find("learning-mode-switch-stub").exists()).toBe(mode === "progressive");
      expect(wrapper.find("practice-view-switch-stub").exists()).toBe(mode === "single");
    },
  );
});
