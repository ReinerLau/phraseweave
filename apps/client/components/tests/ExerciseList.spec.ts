import type { VueWrapper } from "@vue/test-utils";

import { flushPromises, mount } from "@vue/test-utils";
import { createPinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ExerciseResponse } from "~/api/exercise";
import ExerciseList from "../ExerciseList.vue";

// @vitest-environment happy-dom

const mocks = vi.hoisted(() => ({
  save: vi.fn(),
  list: vi.fn(),
  get: vi.fn(),
  navigate: vi.fn(),
  activeCourse: vi.fn(),
}));
vi.mock("~/services/localExerciseDb", async (importOriginal) => ({
  ...(await importOriginal<typeof import("~/services/localExerciseDb")>()),
  saveLocalExercise: mocks.save,
  listLocalExercises: mocks.list,
  getLocalExercise: mocks.get,
}));
vi.mock("#imports", () => ({ navigateTo: mocks.navigate }));
vi.mock("#app", () => ({ navigateTo: mocks.navigate }));
vi.mock("~/composables/courses/activeCourse", () => ({
  useActiveCourseMap: () => ({ updateActiveCourseMap: mocks.activeCourse }),
}));

const backup = {
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
};
const singlePack: ExerciseResponse = {
  id: "existing-pack",
  title: "原练习",
  description: "",
  isFree: true,
  cover: "",
  courses: [
    {
      id: "existing-course",
      coursePackId: "existing-pack",
      title: "内部卡片",
      order: 1,
      completionCount: 3,
      statementIndex: 0,
      learningMode: "sentence-first",
      passedUnitIds: ["0:0"],
      statements: [
        {
          id: "statement",
          order: 1,
          english: "The cat",
          contextBefore: "",
          contextAfter: " sleeps.",
          sentenceChinese: "猫在睡觉。",
          unitId: "0:0",
          sourceUnitIds: [],
        },
      ],
    },
  ],
};
let wrapper: VueWrapper | undefined;
let stored: Map<string, ExerciseResponse>;

beforeEach(() => {
  vi.resetAllMocks();
  stored = new Map();
  mocks.save.mockImplementation(async (pack: ExerciseResponse) => {
    stored.set(pack.id, pack);
  });
  mocks.list.mockImplementation(async () =>
    Array.from(stored.values()).map(({ id, title, description, isFree, cover }) => ({
      id,
      title,
      description,
      isFree,
      cover,
    })),
  );
  mocks.get.mockImplementation(async (id: string) => stored.get(id));
  vi.spyOn(window, "alert").mockImplementation(() => {});
  vi.spyOn(HTMLDialogElement.prototype, "showModal").mockImplementation(function (
    this: HTMLDialogElement,
  ) {
    this.setAttribute("open", "");
  });
  vi.spyOn(HTMLDialogElement.prototype, "close").mockImplementation(function (
    this: HTMLDialogElement,
  ) {
    this.removeAttribute("open");
  });
});
afterEach(() => {
  wrapper?.unmount();
  wrapper = undefined;
  vi.restoreAllMocks();
});

async function render() {
  wrapper = mount(ExerciseList, {
    global: { plugins: [createPinia()], stubs: { NuxtLink: true, Loading: true } },
  });
  await flushPromises();
}
async function selectFile(value: unknown = backup, rawText?: string) {
  const input = wrapper!.find('input[type="file"]');
  const file = new File([rawText ?? JSON.stringify(value)], "exercise.json", {
    type: "application/json",
  });
  Object.defineProperty(input.element, "files", { configurable: true, value: [file] });
  await input.trigger("change");
  await flushPromises();
}
function nameInput() {
  return wrapper!.find('input[type="text"]');
}
async function confirm() {
  await wrapper!.find("dialog .modal-box form").trigger("submit");
  await flushPromises();
}

describe("adding a named exercise", () => {
  it("validates and prefills the name without saving, and cancels without a write", async () => {
    await render();
    await selectFile();
    expect(wrapper!.find("dialog").attributes("open")).toBeDefined();
    expect((nameInput().element as HTMLInputElement).value).toMatch(/^\d{12}$/);
    expect(mocks.save).not.toHaveBeenCalled();
    await wrapper!.find("dialog .modal-action button[type=button]").trigger("click");
    expect(wrapper!.find("dialog").attributes("open")).toBeUndefined();
    expect(mocks.save).not.toHaveBeenCalled();
    await selectFile();
    expect(wrapper!.find("dialog").attributes("open")).toBeDefined();
  });

  it("saves a trimmed name, shows it after reload and opens the saved exercise", async () => {
    await render();
    await selectFile();
    await nameInput().setValue("  我的练习  ");
    await confirm();
    const pack = mocks.save.mock.calls[0][0] as ExerciseResponse;
    expect(pack.title).toBe("我的练习");
    expect(pack.courses[0].title).toBe("我的练习");
    expect(wrapper!.find(".card-title").text()).toBe("我的练习");
    expect(wrapper!.find("dialog").attributes("open")).toBeUndefined();
    wrapper!.unmount();
    await render();
    expect(wrapper!.find(".card-title").text()).toBe("我的练习");
    await wrapper!.find(".card").trigger("click");
    await flushPromises();
    expect(mocks.get).toHaveBeenCalledWith(pack.id);
    expect(mocks.activeCourse).toHaveBeenCalledWith(pack.id, pack.courses[0].id);
    expect(stored.get(pack.id)?.title).toBe("我的练习");
  });

  it("retains the initial default name when the user enters whitespace", async () => {
    await render();
    await selectFile();
    const title = (nameInput().element as HTMLInputElement).value;
    await nameInput().setValue(" \t ");
    await confirm();
    expect(mocks.save.mock.calls[0][0].title).toBe(title);
  });

  it("allows duplicate names for separate exercises", async () => {
    await render();
    for (let i = 0; i < 2; i += 1) {
      await selectFile();
      await nameInput().setValue("同名练习");
      await confirm();
    }
    expect(stored.size).toBe(2);
    expect(wrapper!.findAll(".card-title").map((title) => title.text())).toEqual([
      "同名练习",
      "同名练习",
    ]);
  });

  it("renames a single array backup while preserving its cards and progress", async () => {
    await render();
    await selectFile([singlePack]);
    expect((nameInput().element as HTMLInputElement).value).toBe("原练习");
    await nameInput().setValue("新名称");
    await confirm();
    const pack = mocks.save.mock.calls[0][0] as ExerciseResponse;
    expect(pack.title).toBe("新名称");
    expect(pack.id).toBe(singlePack.id);
    expect(pack.courses).toEqual(singlePack.courses);
  });

  it("keeps the name and stable exercise id for retries after a failure", async () => {
    await render();
    await selectFile();
    await nameInput().setValue("重试练习");
    mocks.save.mockRejectedValueOnce(new Error("保存失败"));
    await confirm();
    expect(wrapper!.find('[role="alert"]').text()).toBe("保存失败");
    expect((nameInput().element as HTMLInputElement).value).toBe("重试练习");
    expect(wrapper!.find("dialog").attributes("open")).toBeDefined();
    await confirm();
    expect(mocks.save.mock.calls[1][0]).toEqual(mocks.save.mock.calls[0][0]);
    expect(stored.size).toBe(1);
    expect(wrapper!.find("dialog").attributes("open")).toBeUndefined();
  });

  it("prevents duplicate saves and cancellation while a save is pending", async () => {
    await render();
    await selectFile();
    let finish!: () => void;
    mocks.save.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    await confirm();
    expect(nameInput().attributes("disabled")).toBeDefined();
    expect(wrapper!.find('dialog button[type="submit"]').attributes("disabled")).toBeDefined();
    await confirm();
    await wrapper!.find("dialog").trigger("cancel");
    expect(mocks.save).toHaveBeenCalledTimes(1);
    expect(wrapper!.find("dialog").attributes("open")).toBeDefined();
    finish();
    await flushPromises();
    expect(wrapper!.find("dialog").attributes("open")).toBeUndefined();
  });

  it("rejects empty, multiple-exercise and invalid files without saving or opening the dialog", async () => {
    await render();
    for (const value of [[], [singlePack, { ...singlePack, id: "second-pack" }]]) {
      await selectFile(value);
      expect(window.alert).toHaveBeenLastCalledWith("仅支持导入单个练习");
      expect(wrapper!.find("dialog").attributes("open")).toBeUndefined();
    }
    await selectFile(undefined, "{invalid");
    expect(wrapper!.find("dialog").attributes("open")).toBeUndefined();
    expect(mocks.save).not.toHaveBeenCalled();
  });
});
