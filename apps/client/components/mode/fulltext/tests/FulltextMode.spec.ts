import { createTestingPinia } from "@pinia/testing";
import { enableAutoUnmount, flushPromises, mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import Contents from "~/components/main/Contents/Contents.vue";
import { useGameMode } from "~/composables/main/game";
import { useExerciseStore } from "~/store/exercise";
import FulltextMode from "../FulltextMode.vue";

vi.mock("~/services/localExerciseDb", () => ({
  saveLocalExerciseProgress: vi.fn().mockResolvedValue(undefined),
  saveLocalExerciseUnitPassed: vi.fn().mockResolvedValue(undefined),
}));
enableAutoUnmount(afterEach);

describe("FulltextMode", () => {
  beforeEach(() => useGameMode().showQuestion());
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function setup() {
    const pinia = createTestingPinia({ createSpy: vi.fn, stubActions: false });
    const store = useExerciseStore(pinia);
    store.currentCourse = {
      id: "course",
      title: "文章",
      coursePackId: "pack",
      order: 1,
      completionCount: 0,
      statementIndex: 0,
      practiceView: "fulltext",
      statements: ["First", "Future", "Last"].map((english, index) => ({
        id: `row-${index}`,
        order: index + 1,
        english,
        contextBefore: "",
        contextAfter: ".",
        sentenceChinese: ["第一句。", "第二句。", "第三句。"][index],
        unitId: `whole-${index}`,
        sourceUnitIds: [],
      })),
    };
    store.statementIndex = 0;
    store.currentStatement = store.currentCourse.statements[0];
    return { pinia, store };
  }

  it("lists every sentence immediately and masks future text without rendering blanks", async () => {
    const { pinia, store } = setup();
    const wrapper = mount(FulltextMode, {
      global: { plugins: [pinia], stubs: { ModeClozeMode: true } },
    });
    expect(wrapper.text()).toContain("第 1 / 3 句");
    expect(wrapper.findAll('[data-testid="fulltext-sentence"]')).toHaveLength(3);
    const pending = wrapper.findAll('[data-testid="fulltext-pending-sentence"]');
    expect(pending).toHaveLength(2);
    for (const row of pending) {
      expect(row.get('[data-testid="fulltext-pending-bar"]').attributes("aria-hidden")).toBe(
        "true",
      );
      expect(row.find("input").exists()).toBe(false);
      expect(row.find("mode-cloze-mode-stub").exists()).toBe(false);
      expect(row.attributes("title")).toBeUndefined();
    }
    expect(wrapper.findAll('[data-testid="fulltext-history-sentence"]')).toHaveLength(0);
    expect(wrapper.text()).not.toContain("Future");
    expect(wrapper.text()).not.toContain("第二句");
    store.passCurrentStatement();
    store.advanceAfterCorrect();
    await flushPromises();
    const history = wrapper.findAll('[data-testid="fulltext-history-sentence"]');
    expect(history).toHaveLength(1);
    expect(history[0].text()).toBe("第一句。First.");
    expect(wrapper.text()).not.toContain("Last");
    expect(wrapper.text()).not.toContain("第三句");
    expect(wrapper.findAll('[data-testid="fulltext-pending-sentence"]')).toHaveLength(1);
    expect(wrapper.findAll('[data-testid="fulltext-sentence"]')).toHaveLength(3);
  });

  it("lists every directory position without revealing future answers or allowing jumps", async () => {
    const { pinia, store } = setup();
    store.currentCourse!.passedUnitIds = ["unit:whole-0", "unit:whole-1", "unit:whole-2"];
    const wrapper = mount(Contents, { global: { plugins: [pinia] } });
    await flushPromises();
    expect(wrapper.text()).toContain("____");
    expect(wrapper.text()).not.toContain("Future");
    expect(wrapper.text()).not.toContain("Last");
    expect(wrapper.findAll(".text-center")).toHaveLength(3);
    store.passCurrentStatement();
    store.advanceAfterCorrect();
    await flushPromises();
    expect(wrapper.text()).toContain("First");
    expect(wrapper.text()).not.toContain("Future");
    await wrapper.get(".text-center").trigger("click");
    expect(store.statementIndex).toBe(1);
  });

  it("keeps repeated original sentences in independent positions", async () => {
    const { pinia, store } = setup();
    Object.assign(store.currentCourse!.statements[2], {
      english: "First",
      sentenceChinese: "第一句。",
    });
    const wrapper = mount(FulltextMode, {
      global: { plugins: [pinia], stubs: { ModeClozeMode: true } },
    });
    expect(
      wrapper
        .findAll('[data-testid="fulltext-sentence"]')
        .map((row) => row.attributes("data-sentence-id")),
    ).toEqual(["row-0", "row-1", "row-2"]);
    store.passCurrentStatement();
    store.advanceAfterCorrect();
    await flushPromises();
    expect(wrapper.get('[data-sentence-id="row-0"]').text()).toBe("第一句。First.");
    const repeated = wrapper.get('[data-sentence-id="row-2"]');
    expect(repeated.find('[data-testid="fulltext-pending-bar"]').exists()).toBe(true);
    expect(repeated.text()).not.toContain("First");
    expect(repeated.text()).not.toContain("第一句");
  });

  it("does not pull a reader back on resize or answer display, but locates the next question", async () => {
    let resize: ResizeObserverCallback = () => {};
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(callback: ResizeObserverCallback) {
          resize = callback;
        }
        observe() {}
        disconnect() {}
      },
    );
    const { pinia, store } = setup();
    const wrapper = mount(FulltextMode, {
      global: { plugins: [pinia], stubs: { ModeClozeMode: true } },
    });
    await flushPromises();
    const scroll = wrapper.get('[data-testid="fulltext-scroll"]').element as HTMLElement;
    Object.defineProperty(scroll, "clientHeight", { configurable: true, value: 600 });
    vi.spyOn(HTMLElement.prototype, "offsetTop", "get").mockReturnValue(1000);
    scroll.scrollTop = 420;
    await wrapper.get('[data-testid="fulltext-scroll"]').trigger("scroll");
    resize([], {} as ResizeObserver);
    useGameMode().showAnswer();
    await flushPromises();
    expect(scroll.scrollTop).toBe(420);
    expect(wrapper.get('[data-testid="fulltext-current"]').attributes("style")).toContain("300px");
    store.passCurrentStatement();
    store.advanceAfterCorrect();
    await flushPromises();
    expect(scroll.scrollTop).toBe(904);
  });

  it("shows completed text at the end and restores all pending bars on restart", async () => {
    const { pinia, store } = setup();
    const wrapper = mount(FulltextMode, {
      global: { plugins: [pinia], stubs: { ModeClozeMode: true } },
    });
    for (let index = 0; index < 3; index++) {
      store.passCurrentStatement();
      store.advanceAfterCorrect();
    }
    await flushPromises();
    expect(wrapper.findAll('[data-testid="fulltext-pending-bar"]')).toHaveLength(0);
    expect(wrapper.get('[data-testid="fulltext-current"]').text()).toContain("第三句。Last.");
    store.doAgain();
    await flushPromises();
    expect(wrapper.findAll('[data-testid="fulltext-sentence"]')).toHaveLength(3);
    expect(wrapper.findAll('[data-testid="fulltext-pending-bar"]')).toHaveLength(2);
    expect(wrapper.findAll('[data-testid="fulltext-history-sentence"]')).toHaveLength(0);
  });
});
