import { createPinia, setActivePinia } from "pinia";
import { beforeEach, expect, it, vi } from "vitest";

import { getLocalExercise, normalizeExerciseImport } from "~/services/localExerciseDb";
import { useExerciseStore } from "../exercise";

vi.mock("~/services/localExerciseDb", async (original) => ({
  ...(await original<typeof import("~/services/localExerciseDb")>()),
  getLocalExercise: vi.fn(),
  saveLocalExercise: vi.fn().mockResolvedValue(undefined),
  saveLocalExerciseProgress: vi.fn().mockResolvedValue(undefined),
  saveLocalExerciseUnitPassed: vi.fn().mockResolvedValue(undefined),
}));

beforeEach(() => {
  setActivePinia(createPinia());
});

it("preserves every occurrence through import, practice, view changes, restart and backup", async () => {
  const entries = [
    { english: "kill", chinese: "动词：杀死" },
    { english: "Killing him would not be easy", chinese: "要杀死他并不容易" },
    { english: "kill", chinese: "动词：杀死" },
  ];
  const [pack] = normalizeExerciseImport({ schema_version: 11, title: "示例", entries });
  const course = pack.courses[0];
  vi.mocked(getLocalExercise).mockImplementation(async () => pack);
  const store = useExerciseStore();
  await store.setup(pack.id, course.id);
  expect(store.practiceView).toBe("single");
  expect(store.totalQuestionsCount).toBe(3);
  expect(store.currentStatement?.english).toBe("kill");
  expect(store.switchPracticeView("fulltext")).toBe(true);
  expect(store.switchPracticeView("single")).toBe(true);
  expect(store.sentences.map((s) => s.english)).toEqual(entries.map((e) => e.english));
  course.statementIndex = 2;
  course.resumeStatementIndex = 2;
  await store.setup(pack.id, course.id);
  expect(store.statementIndex).toBe(2);
  expect(store.currentStatement?.english).toBe("kill");
  course.resumeStatementIndex = null;
  course.completionCount = 1;
  await store.setup(pack.id, course.id);
  expect(store.statementIndex).toBe(0);
  expect(store.totalQuestionsCount).toBe(3);
  const [restored] = normalizeExerciseImport(JSON.parse(JSON.stringify([pack])));
  expect(restored.courses[0].statements.map((s) => s.english)).toEqual(
    entries.map((e) => e.english),
  );
  expect(new Set(restored.courses[0].statements.map((s) => s.unitId)).size).toBe(3);
});
