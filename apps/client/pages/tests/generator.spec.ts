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
  window.localStorage.clear();
  // This happy-dom version does not implement History.replaceState.
  vi.spyOn(window.history, "replaceState").mockImplementation((_state, _title, url) => {
    if (url != null) setUrl(String(url));
  });
  mocks.status.mockResolvedValue({
    runtimeReady: true,
    modelDownloaded: false,
    translationProviders: ["local", "index-translate"],
    initialization: { state: "ready", message: "Ready" },
  });
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

async function submit() {
  await wrapper!.find("form").trigger("submit");
  await flushPromises();
}

async function mountAndGenerate() {
  await mount();
  await submit();
}

describe("generator capture preview", () => {
  it("prefills the editable form and generates only after submission", async () => {
    await mount();
    expect(mocks.status).toHaveBeenCalled();
    expect(mocks.start).not.toHaveBeenCalled();
    expect(wrapper!.find("textarea").element.value).toBe(text);
    await submit();
    expect(mocks.start).toHaveBeenCalledWith({
      text,
      format: "both",
      translationProvider: "local",
    });
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
    await mountAndGenerate();
    let finishSave!: () => void;
    mocks.save.mockReturnValue(
      new Promise<void>((resolve) => {
        finishSave = resolve;
      }),
    );
    await button("保存并进入练习").trigger("click");
    expect(mocks.save).toHaveBeenCalledTimes(1);
    expect(button("正在保存…").attributes("disabled")).toBeDefined();
    expect(wrapper!.find('input[type="text"]').attributes("disabled")).toBeDefined();
    await button("正在保存…").trigger("click");
    expect(mocks.save).toHaveBeenCalledTimes(1);
    expect(mocks.navigate).not.toHaveBeenCalled();
    finishSave();
    await flushPromises();
    const pack = mocks.save.mock.calls[0][0];
    expect(mocks.navigate).toHaveBeenCalledWith(`/game/${pack.id}/${pack.courses[0].id}`);
    expect(mocks.updateActiveCourseMap).toHaveBeenCalledWith(pack.id, pack.courses[0].id);
  });

  it("edits the result name and saves the trimmed title on both the exercise and course", async () => {
    await mountAndGenerate();
    const input = wrapper!.find('input[type="text"]');
    expect((input.element as HTMLInputElement).value).toBe(text);
    expect(input.element.closest("section")?.textContent).toContain("生成文件");
    await input.setValue("  猫的练习  ");
    await button("保存并进入练习").trigger("click");
    await flushPromises();
    const pack = mocks.save.mock.calls[0][0];
    expect(pack.title).toBe("猫的练习");
    expect(pack.courses[0].title).toBe("猫的练习");
    expect(mocks.start).toHaveBeenCalledTimes(1);
  });

  it("uses the generated text as the default name even when the source form changes", async () => {
    await mountAndGenerate();
    await wrapper!.find('input[type="text"]').setValue("  ");
    await wrapper!.find("textarea").setValue("A different text.");
    await button("保存并进入练习").trigger("click");
    await flushPromises();
    expect(mocks.save.mock.calls[0][0].title).toBe(text);
  });

  it("resets the name for the next generation", async () => {
    await mountAndGenerate();
    await wrapper!.find('input[type="text"]').setValue("旧名称");
    await wrapper!.find("textarea").setValue("  A new\nsource text.  ");
    await submit();
    expect((wrapper!.find('input[type="text"]').element as HTMLInputElement).value).toBe(
      "A new source text.",
    );
  });

  it("keeps preview after a save failure and retries without regenerating", async () => {
    await mountAndGenerate();
    await wrapper!.find('input[type="text"]').setValue("重试名称");
    mocks.save.mockRejectedValueOnce(new Error("保存失败"));
    await button("保存并进入练习").trigger("click");
    await flushPromises();
    expect(wrapper!.text()).toContain("保存失败");
    expect(wrapper!.text()).toContain("中文提示：猫在睡觉。");
    expect(mocks.navigate).not.toHaveBeenCalled();
    expect((wrapper!.find('input[type="text"]').element as HTMLInputElement).value).toBe(
      "重试名称",
    );
    await button("保存并进入练习").trigger("click");
    await flushPromises();
    expect(mocks.start).toHaveBeenCalledTimes(1);
    expect(mocks.save).toHaveBeenCalledTimes(2);
    expect(mocks.save.mock.calls[1][0].title).toBe("重试名称");
    expect(mocks.navigate).toHaveBeenCalledTimes(1);
  });

  it("retries a failed generation using the retained selection", async () => {
    mocks.job.mockResolvedValueOnce({ id: "job-1", state: "failed", error: "模型失败" });
    await mountAndGenerate();
    expect(wrapper!.text()).toContain("模型失败");
    expect(mocks.save).not.toHaveBeenCalled();
    expect(wrapper!.find("textarea").element.value).toBe(text);
    await wrapper!.findAll("select")[0].setValue("index-translate");
    await submit();
    expect(mocks.consume).not.toHaveBeenCalled();
    expect(mocks.start).toHaveBeenCalledTimes(2);
    expect(mocks.start).toHaveBeenLastCalledWith({
      text,
      format: "both",
      translationProvider: "index-translate",
    });
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
    const selection = "  English & 中文 + 100% = # ?\nsecond line  ";
    await mount(fragmentRoute(selection));
    expect(wrapper!.find("textarea").element.value).toBe(selection);
    expect(mocks.start).not.toHaveBeenCalled();
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
    expect(mocks.start).not.toHaveBeenCalled();
    const cleaned = window.location.pathname + window.location.search;
    wrapper!.unmount();
    wrapper = undefined;
    await mount(cleaned);
    expect(wrapper!.find("textarea").exists()).toBe(true);
    expect(wrapper!.find("textarea").element.value).toBe("");
    expect(mocks.start).not.toHaveBeenCalled();
  });

  it("keeps ordinary generation manual and previews its results", async () => {
    await mount("/generator");
    expect(mocks.consume).not.toHaveBeenCalled();
    expect(mocks.start).not.toHaveBeenCalled();
    expect(wrapper!.text()).not.toContain("练习模式");
    expect(wrapper!.findAll("select")).toHaveLength(2);
    await wrapper!.find("textarea").setValue(text);
    await wrapper!.find("form").trigger("submit");
    await flushPromises();
    expect(mocks.start).toHaveBeenCalledWith({
      text,
      format: "both",
      translationProvider: "local",
    });
    expect(wrapper!.text()).toContain("中文提示：猫在睡觉。");
    expect(button("保存并进入练习")).toBeDefined();
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it("submits edited selection with the chosen provider and export format", async () => {
    await mount();
    await wrapper!.find("textarea").setValue("The dog runs.");
    const selects = wrapper!.findAll("select");
    await selects[0].setValue("index-translate");
    await selects[1].setValue("markdown");
    expect(wrapper!.text()).toContain("英文原句会发送至 Bilibili");
    await submit();
    expect(mocks.start).toHaveBeenCalledWith({
      text: "The dog runs.",
      format: "markdown",
      translationProvider: "index-translate",
    });
  });

  it("remembers the translation selection for the next page visit", async () => {
    await mount();
    await wrapper!.findAll("select")[0].setValue("index-translate");
    expect(window.localStorage.getItem("phraseweave.translationProvider")).toBe("index-translate");
    wrapper!.unmount();
    await mount();
    expect(wrapper!.findAll("select")[0].element.value).toBe("index-translate");
    expect(mocks.start).not.toHaveBeenCalled();
    await submit();
    expect(mocks.start.mock.calls[0][0].translationProvider).toBe("index-translate");
  });

  it("supports legacy services with only local translation", async () => {
    window.localStorage.setItem("phraseweave.translationProvider", "index-translate");
    mocks.status.mockResolvedValue({ runtimeReady: true, modelDownloaded: true });
    await mount();
    const select = wrapper!.findAll("select")[0];
    expect(select.element.value).toBe("local");
    expect(select.findAll("option")).toHaveLength(1);
    await submit();
    expect(mocks.start.mock.calls[0][0].translationProvider).toBe("local");
  });

  it("prefills legacy captures without generating and removes the consumed URL", async () => {
    await mount(legacyRoute);
    expect(mocks.consume).toHaveBeenCalledTimes(1);
    expect(wrapper!.find("textarea").element.value).toBe(text);
    expect(window.location.search).toBe("");
    expect(mocks.start).not.toHaveBeenCalled();
  });

  it("keeps invalid imports editable for a manual generation", async () => {
    await mount("/generator#text=invalid%");
    expect(mocks.start).not.toHaveBeenCalled();
    await wrapper!.find("textarea").setValue(text);
    await submit();
    expect(mocks.start).toHaveBeenCalledTimes(1);
    expect(wrapper!.text()).not.toContain("无效的选中文本");
  });

  it("does not generate when initialization becomes ready", async () => {
    mocks.status.mockResolvedValueOnce({
      runtimeReady: false,
      modelDownloaded: false,
      initialization: { state: "starting", message: "Starting" },
    });
    await mount();
    expect(button("生成学习单元").attributes("disabled")).toBeDefined();
    await wrapper!.find('button[aria-label="刷新本地服务连接"]').trigger("click");
    await flushPromises();
    expect(button("生成学习单元").attributes("disabled")).toBeUndefined();
    expect(mocks.start).not.toHaveBeenCalled();
  });

  it("prevents duplicate submissions and provider changes while submitting", async () => {
    let accept!: (value: { id: string }) => void;
    mocks.start.mockImplementation(
      () =>
        new Promise((resolve) => {
          accept = resolve;
        }),
    );
    await mount();
    await submit();
    await submit();
    expect(mocks.start).toHaveBeenCalledTimes(1);
    expect(button("生成学习单元").attributes("disabled")).toBeDefined();
    expect(
      wrapper!.findAll("select").every((select) => select.attributes("disabled") !== undefined),
    ).toBe(true);
    accept({ id: "job-1" });
    await flushPromises();
    expect(button("生成学习单元").attributes("disabled")).toBeUndefined();
  });
});
