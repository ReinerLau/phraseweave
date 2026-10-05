// @vitest-environment happy-dom
import type { VueWrapper } from "@vue/test-utils";

import { flushPromises, mount as mountComponent } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import Generator from "../generator.vue";

const mocks = vi.hoisted(() => ({
  route: { query: {} as Record<string, string> },
  status: vi.fn(),
  consume: vi.fn(),
  start: vi.fn(),
  job: vi.fn(),
  release: vi.fn(),
  save: vi.fn(),
  navigate: vi.fn(),
  updateActiveCourseMap: vi.fn(),
}));
vi.mock("#app", () => ({ useRoute: () => mocks.route, navigateTo: mocks.navigate }));
vi.mock("~/services/generatorClient", () => ({
  isLocalPackage: () => true,
  getGeneratorStatus: mocks.status,
  consumeCapture: mocks.consume,
  startGeneratorJob: mocks.start,
  getGeneratorJob: mocks.job,
  releaseGeneratorJob: mocks.release,
  retryGenerator: vi.fn(),
}));
vi.mock("~/services/localExerciseDb", async (importOriginal) => ({
  ...(await importOriginal<typeof import("~/services/localExerciseDb")>()),
  saveLocalExercise: mocks.save,
}));
vi.mock("~/composables/courses/activeCourse", () => ({
  useActiveCourseMap: () => ({ updateActiveCourseMap: mocks.updateActiveCourseMap }),
}));

const text = "The cat sleeps.";
const outputs = [
  {
    name: "units.md",
    content:
      "# 学习单元\n\n中文提示：猫在睡觉。\n\n| 步骤 | 英文 |\n| --- | --- |\n| 1 | The cat |",
  },
  {
    name: "units.json",
    content: JSON.stringify({
      schema_version: 4,
      statements: [
        {
          english: "The cat",
          context_before: "",
          context_after: " sleeps.",
          sentence_chinese: "猫在睡觉。",
          unit_id: "0:0",
          source_unit_ids: [],
        },
      ],
    }),
  },
];
const legacyRoute = "/generator?capture=0123456789abcdef0123456789abcdef";
const fragmentRoute = (text: string) =>
  `/generator#text=${Buffer.from(text).toString("base64url")}`;
const route = fragmentRoute(text);
let wrapper: VueWrapper | undefined;

function setUrl(url: string) {
  const browser = window as unknown as { happyDOM: { setURL: (url: string) => void } };
  browser.happyDOM.setURL(new URL(url, window.location.href).href);
}

beforeEach(() => {
  vi.resetAllMocks();
  // This happy-dom version does not implement History.replaceState.
  vi.spyOn(window.history, "replaceState").mockImplementation((_state, _title, url) => {
    if (url != null) setUrl(String(url));
  });
  mocks.status.mockResolvedValue({ runtimeReady: true, modelDownloaded: true });
  mocks.consume.mockResolvedValue(text);
  mocks.start.mockResolvedValue({ id: "job-1" });
  mocks.job.mockResolvedValue({ id: "job-1", state: "complete", result: { outputs } });
  mocks.release.mockResolvedValue(undefined);
  mocks.save.mockResolvedValue(undefined);
  mocks.navigate.mockResolvedValue(undefined);
});
afterEach(() => {
  wrapper?.unmount();
  wrapper = undefined;
  setUrl("/");
  vi.restoreAllMocks();
});

async function mount(routeValue = route) {
  setUrl(routeValue);
  mocks.route.query = routeValue.includes("capture=")
    ? { capture: "0123456789abcdef0123456789abcdef" }
    : {};
  wrapper = mountComponent(Generator, { global: { stubs: { BackLink: true, NuxtLink: true } } });
  await flushPromises();
  return wrapper;
}
function button(label: string) {
  return wrapper!.findAll("button").find((item) => item.text() === label)!;
}

describe("generator capture preview", () => {
  it("generates both formats and previews without saving or navigating", async () => {
    await mount();
    expect(mocks.status).toHaveBeenCalled();
    expect(mocks.start).toHaveBeenCalledWith({ text, format: "both" });
    expect(mocks.consume).not.toHaveBeenCalled();
    expect(window.location.hash).toBe("");
    expect(wrapper!.text()).toContain("中文提示：猫在睡觉。");
    expect(wrapper!.text()).toContain("The cat");
    expect(wrapper!.text()).toContain("下载 units.md");
    expect(wrapper!.text()).toContain("下载 units.json");
    expect(button("保存并进入练习")).toBeDefined();
    expect(mocks.save).not.toHaveBeenCalled();
    expect(mocks.navigate).not.toHaveBeenCalled();
  });

  it("saves once on confirmation, disables the button, then opens the exercise", async () => {
    await mount();
    let finishSave!: () => void;
    mocks.save.mockReturnValue(
      new Promise<void>((resolve) => {
        finishSave = resolve;
      }),
    );
    await button("保存并进入练习").trigger("click");
    expect(mocks.save).toHaveBeenCalledTimes(1);
    expect(button("正在保存…").attributes("disabled")).toBeDefined();
    expect(mocks.navigate).not.toHaveBeenCalled();
    finishSave();
    await flushPromises();
    const pack = mocks.save.mock.calls[0][0];
    expect(mocks.navigate).toHaveBeenCalledWith(`/game/${pack.id}/${pack.courses[0].id}`);
    expect(mocks.updateActiveCourseMap).toHaveBeenCalledWith(pack.id, pack.courses[0].id);
  });

  it("keeps preview after a save failure and retries without regenerating", async () => {
    await mount();
    mocks.save.mockRejectedValueOnce(new Error("保存失败"));
    await button("保存并进入练习").trigger("click");
    await flushPromises();
    expect(wrapper!.text()).toContain("保存失败");
    expect(wrapper!.text()).toContain("中文提示：猫在睡觉。");
    expect(mocks.navigate).not.toHaveBeenCalled();
    await button("保存并进入练习").trigger("click");
    await flushPromises();
    expect(mocks.start).toHaveBeenCalledTimes(1);
    expect(mocks.save).toHaveBeenCalledTimes(2);
    expect(mocks.navigate).toHaveBeenCalledTimes(1);
  });

  it("retries a failed generation using the retained selection", async () => {
    mocks.job.mockResolvedValueOnce({ id: "job-1", state: "failed", error: "模型失败" });
    await mount();
    expect(wrapper!.text()).toContain("模型失败");
    expect(mocks.save).not.toHaveBeenCalled();
    await button("重试").trigger("click");
    await flushPromises();
    expect(mocks.consume).not.toHaveBeenCalled();
    expect(mocks.start).toHaveBeenCalledTimes(2);
    expect(wrapper!.text()).toContain("中文提示：猫在睡觉。");
    expect(mocks.navigate).not.toHaveBeenCalled();
  });

  it("reports expired captures without generating", async () => {
    mocks.consume.mockRejectedValue(new Error("选中文本已过期，请重新从浏览器导入。"));
    await mount(legacyRoute);
    expect(wrapper!.text()).toContain("选中文本已过期");
    expect(mocks.start).not.toHaveBeenCalled();
  });

  it("decodes fragment text exactly once and removes it before generation", async () => {
    const selection = "English & 中文 + 100% = # ?\nsecond line";
    await mount(fragmentRoute(selection));
    expect(mocks.start).toHaveBeenCalledWith({ text: selection, format: "both" });
    expect(window.location.hash).toBe("");
    expect(mocks.consume).not.toHaveBeenCalled();
  });

  it("rejects empty and oversized fragment selections without generating", async () => {
    for (const selection of ["", "a".repeat(30001)]) {
      await mount(fragmentRoute(selection));
      expect(mocks.start).not.toHaveBeenCalled();
      expect(window.location.hash).toBe("");
      expect(wrapper!.find('[role="alert"]').exists()).toBe(true);
      wrapper!.unmount();
      wrapper = undefined;
    }
  });

  it("reports malformed fragment encoding without generating", async () => {
    for (const encoded of ["invalid%", "a", "_w"]) {
      await mount(`/generator#text=${encoded}`);
      expect(mocks.start).not.toHaveBeenCalled();
      expect(window.location.hash).toBe("");
      expect(wrapper!.text()).toContain("无效的选中文本");
      wrapper!.unmount();
      wrapper = undefined;
    }
  });

  it("does not regenerate a selection when the cleaned page is refreshed", async () => {
    await mount();
    expect(mocks.start).toHaveBeenCalledTimes(1);
    const cleaned = window.location.pathname + window.location.search;
    wrapper!.unmount();
    wrapper = undefined;
    await mount(cleaned);
    expect(wrapper!.find("textarea").exists()).toBe(true);
    expect(mocks.start).toHaveBeenCalledTimes(1);
  });

  it("keeps ordinary generation manual and previews its results", async () => {
    await mount("/generator");
    expect(mocks.consume).not.toHaveBeenCalled();
    expect(mocks.start).not.toHaveBeenCalled();
    expect(wrapper!.text()).not.toContain("练习模式");
    expect(wrapper!.findAll("select")).toHaveLength(1);
    await wrapper!.find("textarea").setValue(text);
    await wrapper!.find("form").trigger("submit");
    await flushPromises();
    expect(mocks.start).toHaveBeenCalledWith({ text, format: "both" });
    expect(wrapper!.text()).toContain("中文提示：猫在睡觉。");
    expect(button("保存并进入练习")).toBeDefined();
    expect(mocks.save).not.toHaveBeenCalled();
  });
});
