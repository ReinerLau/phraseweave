import { mockNuxtImport } from "@nuxt/test-utils/runtime";
import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getLocalExercise } from "~/services/localExerciseDb";
import ExerciseCard from "../ExerciseCard.vue";

const { navigateTo } = vi.hoisted(() => ({ navigateTo: vi.fn() }));
mockNuxtImport("navigateTo", () => navigateTo);
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

    expect(wrapper.find('button[aria-label="删除"]').exists()).toBe(false);

    const moreButton = wrapper.find('button[aria-label="更多操作"]');
    expect(moreButton.attributes("title")).toBe("更多操作");
    expect(moreButton.classes()).toEqual(
      expect.arrayContaining(["h-8", "min-h-8", "w-8", "min-w-8", "p-0"]),
    );
    expect(moreButton.find("span").classes()).toContain("i-ph-dots-three-vertical");

    await moreButton.trigger("click");

    const deleteButton = wrapper.find('button[aria-label="删除"]');
    expect(deleteButton.attributes("title")).toBe("删除");
    expect(deleteButton.find("span").classes()).toContain("i-ph-trash");
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

describe("ExerciseCard selection", () => {
  const exercise = { id: "exercise-1", title: "练习一", description: "", isFree: true, cover: "" };
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("toggles a card without loading or navigating to the exercise", async () => {
    const wrapper = mount(ExerciseCard, { props: { exercise, selectionMode: true } });
    await wrapper.trigger("click");
    expect(wrapper.emitted("select")).toEqual([[exercise.id]]);
    expect(wrapper.find('button[aria-label="更多操作"]').exists()).toBe(false);
    expect(getLocalExercise).not.toHaveBeenCalled();
    expect(navigateTo).not.toHaveBeenCalled();
    await wrapper.setProps({ selected: true });
    expect(wrapper.get<HTMLInputElement>('input[type="checkbox"]').element.checked).toBe(true);
  });

  it("uses a labeled native checkbox and emits exactly once for its change", async () => {
    const wrapper = mount(ExerciseCard, { props: { exercise, selectionMode: true } });
    const checkbox = wrapper.get('input[type="checkbox"]');
    expect(checkbox.attributes("aria-label")).toContain(exercise.title);
    await checkbox.setValue(true);
    expect(wrapper.emitted("select")).toEqual([[exercise.id]]);
    expect(navigateTo).not.toHaveBeenCalled();
  });

  it("blocks both card and checkbox selection while disabled", async () => {
    const wrapper = mount(ExerciseCard, {
      props: { exercise, selectionMode: true, disabled: true },
    });
    await wrapper.trigger("click");
    const checkbox = wrapper.get<HTMLInputElement>('input[type="checkbox"]');
    expect(checkbox.element.disabled).toBe(true);
    await checkbox.trigger("change");
    expect(wrapper.emitted("select")).toBeUndefined();
    expect(navigateTo).not.toHaveBeenCalled();
  });

  it("closes the more menu across mode changes and restores normal navigation", async () => {
    const wrapper = mount(ExerciseCard, { props: { exercise } });
    await wrapper.get('button[aria-label="更多操作"]').trigger("click");
    await wrapper.setProps({ selectionMode: true });
    await wrapper.setProps({ selectionMode: false });
    expect(wrapper.find('[role="menu"]').exists()).toBe(false);
    vi.mocked(getLocalExercise).mockResolvedValue({
      ...exercise,
      courses: [
        {
          id: "course-1",
          title: "练习一",
          order: 1,
          coursePackId: exercise.id,
          completionCount: 0,
          statementIndex: 0,
          statements: [],
        },
      ],
    });
    await wrapper.trigger("click");
    await flushPromises();
    expect(navigateTo).toHaveBeenCalledWith("/game/exercise-1/course-1");
  });
});
