import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  deleteLocalExercise,
  getLocalExercise,
  listLocalExercises,
  saveLocalExercise,
  saveLocalExerciseCatalog,
} from "~/services/localExerciseDb";
import { useExerciseCatalogStore } from "~/store/exerciseCatalog";

vi.mock("~/api/exercise", () => ({
  fetchExercise: vi.fn(),
  fetchExercises: vi.fn(),
}));
vi.mock("~/api/courseHistory", () => ({ fetchCourseHistory: vi.fn() }));
vi.mock("~/services/localExerciseDb", () => ({
  getLocalExercise: vi.fn(),
  deleteLocalExercise: vi.fn(),
  listLocalExercises: vi.fn(),
  saveLocalExercise: vi.fn(),
  saveLocalExerciseCatalog: vi.fn(),
}));

describe("course pack catalog", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    setActivePinia(createPinia());
  });

  it("loads only imported local packs", async () => {
    const importedPack = {
      id: "imported-pack",
      title: "导入课程",
      description: "",
      isFree: true,
      cover: "",
    };
    vi.mocked(listLocalExercises).mockResolvedValue([importedPack]);

    const store = useExerciseCatalogStore();
    await store.setupExercises();

    expect(store.exercises).toEqual([importedPack]);
    expect(saveLocalExerciseCatalog).not.toHaveBeenCalled();
  });

  it("deletes the local pack and removes it from the list", async () => {
    const firstPack = {
      id: "first-pack",
      title: "第一课包",
      description: "",
      isFree: true,
      cover: "",
    };
    const secondPack = {
      id: "second-pack",
      title: "第二课包",
      description: "",
      isFree: true,
      cover: "",
    };
    vi.mocked(listLocalExercises).mockResolvedValue([firstPack, secondPack]);

    const store = useExerciseCatalogStore();
    await store.setupExercises();
    await store.removeExercise(firstPack.id);

    expect(deleteLocalExercise).toHaveBeenCalledWith(firstPack.id);
    expect(store.exercises).toEqual([secondPack]);
  });
});

describe("bulk exercise deletion", () => {
  const packs = ["first", "second", "third"].map((id) => ({
    id,
    title: id,
    description: "",
    isFree: true,
    cover: "",
    courses: [],
  }));

  beforeEach(() => {
    vi.resetAllMocks();
    setActivePinia(createPinia());
    vi.mocked(listLocalExercises).mockResolvedValue(packs);
  });

  it("deduplicates IDs, clears the deleted current exercise and keeps unselected exercises", async () => {
    const store = useExerciseCatalogStore();
    await store.setupExercises();
    store.currentExercise = packs[0];
    expect(await store.removeExercises(["first", "first", "second"])).toEqual({
      deletedIds: ["first", "second"],
      failedIds: [],
    });
    expect(deleteLocalExercise).toHaveBeenCalledTimes(2);
    expect(store.currentExercise).toBeUndefined();
    expect(store.exercises).toEqual([packs[2]]);
  });

  it("continues after a failure, keeps the failed current exercise and retries it", async () => {
    const store = useExerciseCatalogStore();
    await store.setupExercises();
    store.currentExercise = packs[1];
    vi.mocked(deleteLocalExercise).mockImplementation(async (id) => {
      if (id === "second") throw new Error("Storage unavailable");
    });
    const result = await store.removeExercises(["first", "second", "third"]);
    expect(result).toEqual({ deletedIds: ["first", "third"], failedIds: ["second"] });
    expect(store.exercises).toEqual([packs[1]]);
    expect(store.currentExercise).toEqual(packs[1]);
    vi.mocked(deleteLocalExercise).mockResolvedValue();
    expect(await store.removeExercises(result.failedIds)).toEqual({
      deletedIds: ["second"],
      failedIds: [],
    });
    expect(store.exercises).toEqual([]);
    expect(store.currentExercise).toBeUndefined();
  });

  it("preserves all data when every deletion fails", async () => {
    const store = useExerciseCatalogStore();
    await store.setupExercises();
    vi.mocked(deleteLocalExercise).mockRejectedValue(new Error("Storage unavailable"));
    expect(await store.removeExercises(["first", "second", "third"])).toEqual({
      deletedIds: [],
      failedIds: ["first", "second", "third"],
    });
    expect(store.exercises).toEqual(packs);
  });

  it("does nothing for an empty selection", async () => {
    const store = useExerciseCatalogStore();
    expect(await store.removeExercises([])).toEqual({ deletedIds: [], failedIds: [] });
    expect(deleteLocalExercise).not.toHaveBeenCalled();
  });
});
