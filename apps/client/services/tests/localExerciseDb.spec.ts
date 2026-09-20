import { describe, expect, it } from "vitest";

import { normalizeExerciseImport } from "~/services/localExerciseDb";

describe("normalizeExerciseImport", () => {
  it("converts a lexical-chunks earthworm backup into a local course pack", () => {
    const [coursePack] = normalizeExerciseImport(
      {
        schema_version: 1,
        statements: [
          { chinese: "鸟鸣", english: "Birdsong", soundmark: "" },
          { chinese: "有益的", english: "good", soundmark: "" },
        ],
      },
      {
        title: "导入课程",
        idFactory: (() => {
          const ids = ["pack-1", "course-1", "statement-1", "statement-2"];
          return () => ids.shift()!;
        })(),
      },
    );

    expect(coursePack).toMatchObject({
      id: "pack-1",
      title: "导入课程",
      description: "",
      isFree: true,
      cover: "",
      courses: [
        {
          id: "course-1",
          title: "导入课程",
          order: 1,
          coursePackId: "pack-1",
          completionCount: 0,
          statementIndex: 0,
          statements: [
            {
              id: "statement-1",
              order: 1,
              chinese: "鸟鸣",
              english: "Birdsong",
              soundmark: "",
            },
            {
              id: "statement-2",
              order: 2,
              chinese: "有益的",
              english: "good",
              soundmark: "",
            },
          ],
        },
      ],
    });
  });

  it("keeps accepting the existing array backup format", () => {
    const coursePack = {
      id: "pack-1",
      title: "练习",
      description: "描述",
      isFree: true,
      cover: "",
      courses: [],
    };

    expect(normalizeExerciseImport([coursePack])).toEqual([coursePack]);
  });

  it("uses the local import time as the default title", () => {
    const [coursePack] = normalizeExerciseImport(
      {
        schema_version: 1,
        statements: [{ chinese: "鸟鸣", english: "Birdsong", soundmark: "" }],
      },
      { idFactory: () => "id" },
    );

    expect(coursePack.title).toMatch(/^\d{12}$/);
  });

  it("rejects malformed lexical-chunks statements", () => {
    expect(() =>
      normalizeExerciseImport({
        schema_version: 1,
        statements: [{ chinese: "鸟鸣", english: "Birdsong" }],
      }),
    ).toThrow("备份文件包含无效练习");
  });
});
