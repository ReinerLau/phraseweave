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
  });

  it("emits a sync action for the selected exercise", async () => {
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

    const syncButton = wrapper.findAll("button")[0];
    expect(syncButton.attributes("aria-label")).toBe("同步");
    expect(syncButton.find(".i-ph-arrows-clockwise").exists()).toBe(true);

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
  });
});
