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

  it("renders bilingual preceding sentences without putting future content in the DOM", async () => {
    const { pinia, store } = setup();
    const wrapper = mount(FulltextMode, {
      global: { plugins: [pinia], stubs: { ModeClozeMode: true } },
    });
    expect(wrapper.text()).toContain("第 1 / 3 句");
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
  });

  it("limits the directory to revealed questions and its rows cannot change the active question", async () => {
    const { pinia, store } = setup();
    store.currentCourse!.passedUnitIds = ["unit:whole-0", "unit:whole-1", "unit:whole-2"];
    const wrapper = mount(Contents, { global: { plugins: [pinia] } });
    await flushPromises();
    expect(wrapper.text()).toContain("____");
    expect(wrapper.text()).not.toContain("Future");
    expect(wrapper.text()).not.toContain("Last");
    store.passCurrentStatement();
    store.advanceAfterCorrect();
    await flushPromises();
    expect(wrapper.text()).toContain("First");
    expect(wrapper.text()).not.toContain("Future");
    await wrapper.get(".text-center").trigger("click");
    expect(store.statementIndex).toBe(1);
  });
});
