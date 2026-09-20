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
    vi.clearAllMocks();
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
