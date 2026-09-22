import { mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";

import ExerciseCard from "../ExerciseCard.vue";

vi.mock("#imports", () => ({
  navigateTo: vi.fn(),
}));
vi.mock("~/services/localExerciseDb", () => ({
  getLocalExercise: vi.fn(),
}));

describe("ExerciseCard", () => {
  it("renders the imported exercise description", () => {
    const wrapper = mount(ExerciseCard, {
      props: {
        exercise: {
          id: "exercise-1",
          title: "202609201714",
          description: "导入的练习",
          isFree: true,
          cover: "",
        },
      },
    });

    expect(wrapper.text()).toContain("导入的练习");
    expect(wrapper.classes()).toContain("h-full");
    expect(wrapper.classes()).toContain("w-full");
    expect(wrapper.classes()).not.toContain("w-72");
  });

  it("does not render an empty description element", () => {
    const wrapper = mount(ExerciseCard, {
      props: {
        exercise: {
          id: "exercise-1",
          title: "202609201714",
          description: "",
          isFree: true,
          cover: "",
        },
      },
    });

    expect(wrapper.find("p").exists()).toBe(false);
  });

  it("wraps long titles and aligns the actions with their top", () => {
    const wrapper = mount(ExerciseCard, {
      props: {
        exercise: {
          id: "exercise-1",
          title: "这是一个足够长的练习标题用于验证卡片标题能够正常换行",
          description: "导入的练习",
          isFree: true,
          cover: "",
        },
      },
    });

    const title = wrapper.find("h2");
    const titleRow = title.element.parentElement;

    expect(title.classes()).toEqual(
      expect.arrayContaining(["line-clamp-2", "min-w-0", "flex-1", "break-words"]),
    );
    expect(titleRow?.classList).toContain("items-start");
  });

  it("groups exercise actions behind a more menu", async () => {
    const wrapper = mount(ExerciseCard, {
      props: {
        exercise: {
          id: "exercise-1",
          title: "202609201714",
          description: "导入的练习",
          isFree: true,
          cover: "",
        },
      },
    });

    expect(wrapper.find('button[aria-label="同步"]').exists()).toBe(false);
    expect(wrapper.find('button[aria-label="删除"]').exists()).toBe(false);

    const moreButton = wrapper.find('button[aria-label="更多操作"]');
    expect(moreButton.attributes("title")).toBe("更多操作");
    expect(moreButton.classes()).toContain("pr-0");
    expect(moreButton.find("span").classes()).toContain("i-ph-dots-three-vertical");

    await moreButton.trigger("click");

    const syncButton = wrapper.find('button[aria-label="同步"]');
    expect(syncButton.attributes("title")).toBe("同步");
    expect(syncButton.find("span").classes()).toContain("i-ph-arrows-clockwise");
    const deleteButton = wrapper.find('button[aria-label="删除"]');
    expect(deleteButton.attributes("title")).toBe("删除");
    expect(deleteButton.find("span").classes()).toContain("i-ph-trash");

    await syncButton.trigger("click");

    expect(wrapper.emitted("sync")).toEqual([
      [
        {
          id: "exercise-1",
          title: "202609201714",
          description: "导入的练习",
          isFree: true,
          cover: "",
        },
      ],
    ]);

    expect(wrapper.find('button[aria-label="同步"]').exists()).toBe(false);

    await moreButton.trigger("click");
    await wrapper.find('button[aria-label="删除"]').trigger("click");

    expect(wrapper.emitted("delete")).toEqual([
      [
        {
          id: "exercise-1",
          title: "202609201714",
          description: "导入的练习",
          isFree: true,
          cover: "",
        },
      ],
    ]);
    expect(wrapper.find('button[aria-label="删除"]').exists()).toBe(false);
  });
});
