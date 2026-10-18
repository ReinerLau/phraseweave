// @vitest-environment happy-dom
import { enableAutoUnmount, flushPromises, shallowMount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import Practice from "../game/[coursePackId]/[id].vue";

const mocks = vi.hoisted(() => ({ setup: vi.fn(), preload: vi.fn(), dispose: vi.fn() }));
vi.mock("vue-router", () => ({
  useRoute: () => ({ params: { coursePackId: "pack", id: "course" } }),
}));
vi.mock("~/store/exercise", () => ({ useExerciseStore: () => ({ setup: mocks.setup }) }));
vi.mock("~/composables/main/game", () => ({ useGameMode: () => ({ showQuestion: vi.fn() }) }));
vi.mock("~/composables/useWordAudio", () => ({
  useWordAudio: () => ({ stopWordAudio: vi.fn(), disposeWordAudio: mocks.dispose }),
}));
vi.mock("~/services/pronunciation", () => ({ preloadPronunciations: mocks.preload }));

enableAutoUnmount(afterEach);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.preload.mockResolvedValue(undefined);
});

function mountPractice() {
  return shallowMount(Practice, {
    global: {
      stubs: {
        Loading: { template: '<div data-testid="loading" />' },
        Tool: true,
        Game: true,
        Tips: true,
        NuxtLink: { props: ["href"], template: '<a :href="href"><slot /></a>' },
      },
    },
  });
}

describe("practice loading", () => {
  it("leaves loading on success and renders the exercise", async () => {
    mocks.setup.mockResolvedValue(undefined);
    const wrapper = mountPractice();
    await flushPromises();
    expect(mocks.setup).toHaveBeenCalledWith("pack", "course");
    expect(wrapper.find('[data-testid="loading"]').exists()).toBe(false);
    expect(wrapper.find("game-stub").exists()).toBe(true);
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
    expect(mocks.preload).toHaveBeenCalledOnce();
  });

  it.each([
    new Error("该练习缺少原句分组或完整中文提示，请重新生成以使用整句优先和全文模式。"),
    new Error("本地找不到该练习卡片"),
    "unexpected failure",
  ])("shows an actionable error and stops loading: %s", async (error) => {
    mocks.setup.mockRejectedValue(error);
    const wrapper = mountPractice();
    await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toBe(
      error instanceof Error ? error.message : "加载练习失败，请返回练习列表后重试。",
    );
    expect(wrapper.get('a[href="/course-pack"]').text()).toBe("返回练习列表");
    expect(wrapper.find('[data-testid="loading"]').exists()).toBe(false);
    expect(wrapper.find("game-stub").exists()).toBe(false);
    expect(wrapper.find("tool-stub").exists()).toBe(false);
    expect(mocks.preload).not.toHaveBeenCalled();
  });
});
