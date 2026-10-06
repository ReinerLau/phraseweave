import type { VueWrapper } from "@vue/test-utils";

import { mockNuxtImport } from "@nuxt/test-utils/runtime";
import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import ExerciseList from "~/components/ExerciseList.vue";
import { deleteLocalExercise, listLocalExercises } from "~/services/localExerciseDb";
import { useExerciseCatalogStore } from "~/store/exerciseCatalog";

const { navigateTo } = vi.hoisted(() => ({ navigateTo: vi.fn() }));
mockNuxtImport("navigateTo", () => navigateTo);
vi.mock("~/services/localExerciseDb", () => ({
  deleteLocalExercise: vi.fn(),
  getLocalExercise: vi.fn(),
  listLocalExercises: vi.fn(),
  normalizeExerciseImport: vi.fn(),
  saveLocalExercise: vi.fn(),
}));

describe("ExerciseList bulk management", () => {
  const exercises = ["first", "second", "third"].map((id) => ({
    id,
    title: id,
    description: "",
    isFree: true,
    cover: "",
  }));
  let wrapper: VueWrapper;

  beforeEach(() => {
    vi.resetAllMocks();
    setActivePinia(createPinia());
    vi.spyOn(window, "confirm").mockReturnValue(true);
    vi.spyOn(window, "alert").mockImplementation(() => {});
    useExerciseCatalogStore().exercises = [...exercises];
  });

  afterEach(() => {
    wrapper?.unmount();
    vi.restoreAllMocks();
  });

  function render() {
    wrapper = mount(ExerciseList, {
      global: { stubs: { NuxtLink: { template: "<a><slot /></a>" }, Loading: true } },
    });
  }

  function button(text: string) {
    return wrapper.findAll("button").find((item) => item.text() === text)!;
  }

  const selectionBoxes = () => wrapper.findAll<HTMLInputElement>('input[aria-label^="选择练习"]');
  const selectAll = () => wrapper.get<HTMLInputElement>('label input[type="checkbox"]');

  it("enters with no selection, supports partial/all selection, and clears on cancel", async () => {
    render();
    await button("批量管理").trigger("click");
    expect(wrapper.text()).not.toContain("生成练习");
    expect(wrapper.text()).not.toContain("添加练习");
    expect(button("删除").attributes("disabled")).toBeDefined();
    await wrapper.get(".card").trigger("click");
    expect(wrapper.text()).toContain("已选 1 项");
    expect(navigateTo).not.toHaveBeenCalled();
    expect(selectAll().element.indeterminate).toBe(true);
    await selectAll().setValue(true);
    expect(wrapper.text()).toContain("已选 3 项");
    expect(selectAll().element.indeterminate).toBe(false);
    await selectAll().setValue(false);
    expect(wrapper.text()).toContain("已选 0 项");
    await selectionBoxes()[0].setValue(true);
    await button("取消").trigger("click");
    expect(wrapper.text()).toContain("生成练习");
    expect(selectionBoxes()).toHaveLength(0);
    await button("批量管理").trigger("click");
    expect(wrapper.text()).toContain("已选 0 项");
  });

  it("keeps selected exercises when confirmation is cancelled", async () => {
    render();
    await button("批量管理").trigger("click");
    await selectionBoxes()[0].setValue(true);
    vi.mocked(window.confirm).mockReturnValue(false);
    await button("删除").trigger("click");
    expect(window.confirm).toHaveBeenCalledWith(
      "确定删除选中的 1 个练习吗？练习内容和学习进度将一并删除，此操作无法撤销。",
    );
    expect(deleteLocalExercise).not.toHaveBeenCalled();
    expect(selectionBoxes()[0].element.checked).toBe(true);
  });

  it("disables selection and repeat submissions until all deletions complete", async () => {
    let finish!: () => void;
    vi.mocked(deleteLocalExercise).mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    render();
    await button("批量管理").trigger("click");
    await selectAll().setValue(true);
    const deleteButton = button("删除");
    await deleteButton.trigger("click");
    expect(wrapper.text()).toContain("删除中…");
    expect(selectionBoxes().every((item) => item.element.disabled)).toBe(true);
    expect(selectAll().element.disabled).toBe(true);
    expect(button("取消").attributes("disabled")).toBeDefined();
    await deleteButton.trigger("click");
    await wrapper.get(".card").trigger("click");
    expect(wrapper.text()).toContain("已选 3 项");
    expect(window.confirm).toHaveBeenCalledTimes(1);
    expect(deleteLocalExercise).toHaveBeenCalledTimes(1);
    finish();
    await flushPromises();
    expect(deleteLocalExercise).toHaveBeenCalledTimes(3);
    expect(wrapper.text()).toContain("暂无练习");
    expect(wrapper.text()).toContain("添加练习");
    expect(wrapper.text()).not.toContain("批量管理");
  });

  it("keeps only failed items selected and retries them", async () => {
    vi.mocked(deleteLocalExercise).mockImplementation(async (id) => {
      if (id === "second") throw new Error("Storage unavailable");
    });
    render();
    await button("批量管理").trigger("click");
    await selectAll().setValue(true);
    await button("删除").trigger("click");
    await flushPromises();
    expect(window.alert).toHaveBeenCalledWith("已删除 2 个练习，1 个删除失败，请重试。");
    expect(selectionBoxes()).toHaveLength(1);
    expect(selectionBoxes()[0].element.checked).toBe(true);
    expect(wrapper.text()).toContain("已选 1 项");
    vi.mocked(deleteLocalExercise).mockResolvedValue();
    await button("删除").trigger("click");
    await flushPromises();
    expect(deleteLocalExercise).toHaveBeenLastCalledWith("second");
    expect(wrapper.text()).toContain("暂无练习");
  });

  it("keeps all selections and restores controls after every deletion fails", async () => {
    vi.mocked(deleteLocalExercise).mockRejectedValue(new Error("Storage unavailable"));
    render();
    await button("批量管理").trigger("click");
    await selectAll().setValue(true);
    await button("删除").trigger("click");
    await flushPromises();
    expect(window.alert).toHaveBeenCalledWith("已删除 0 个练习，3 个删除失败，请重试。");
    expect(selectionBoxes().every((item) => item.element.checked && !item.element.disabled)).toBe(
      true,
    );
    expect(button("删除").attributes("disabled")).toBeUndefined();
  });

  it("ignores selected IDs removed from the catalog", async () => {
    render();
    await button("批量管理").trigger("click");
    await selectionBoxes()[0].setValue(true);
    useExerciseCatalogStore().exercises = exercises.slice(1);
    await flushPromises();
    expect(wrapper.text()).toContain("已选 0 项");
    expect(button("删除").attributes("disabled")).toBeDefined();
  });

  it("hides management while loading an empty catalog", async () => {
    let finish!: (value: typeof exercises) => void;
    useExerciseCatalogStore().exercises = [];
    vi.mocked(listLocalExercises).mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    render();
    expect(wrapper.text()).not.toContain("批量管理");
    finish([]);
    await flushPromises();
    expect(wrapper.text()).toContain("暂无练习");
    expect(wrapper.text()).not.toContain("批量管理");
  });

  it("still supports single deletion in normal mode", async () => {
    render();
    await wrapper.get('button[aria-label="更多操作"]').trigger("click");
    await wrapper.get('button[aria-label="删除"]').trigger("click");
    await flushPromises();
    expect(window.confirm).toHaveBeenCalledWith("确定删除练习“first”吗？");
    expect(deleteLocalExercise).toHaveBeenCalledWith("first");
    expect(wrapper.findAll(".card")).toHaveLength(2);
  });
});
