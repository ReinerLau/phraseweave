import { describe, expect, it } from "vitest";

import { mergeLocalExerciseProgress, normalizeExerciseImport } from "~/services/localExerciseDb";

const firstUnit = {
  english: "Birdsong",
  context_before: "",
  context_after: " is good.",
  sentence_chinese: "鸟鸣很好。",
  unit_id: "0:0",
  source_unit_ids: [],
};

describe("normalizeExerciseImport", () => {
  it("converts a schema 4 cloze backup into a local course pack", () => {
    const [coursePack] = normalizeExerciseImport(
      { schema_version: 4, statements: [firstUnit] },
      {
        title: "导入课程",
        idFactory: (() => {
          const ids = ["pack-1", "course-1", "statement-1"];
          return () => ids.shift()!;
        })(),
      },
    );

    expect(coursePack).toMatchObject({
      id: "pack-1",
      title: "导入课程",
      courses: [
        {
          id: "course-1",
          statements: [
            {
              id: "statement-1",
              english: "Birdsong",
              contextBefore: "",
              contextAfter: " is good.",
              sentenceChinese: "鸟鸣很好。",
              unitId: "0:0",
              sourceUnitIds: [],
            },
          ],
        },
      ],
    });
  });

  it("keeps accepting array backups with cloze context", () => {
    const coursePack = {
      id: "pack-1",
      title: "练习",
      courses: [
        {
          statements: [
            {
              english: "Birdsong",
              contextBefore: "",
              contextAfter: " is good.",
              sentenceChinese: "鸟鸣很好。",
            },
          ],
        },
      ],
    };

    expect(normalizeExerciseImport([coursePack])).toEqual([coursePack]);
  });

  it("uses the local import time as the default title", () => {
    const [coursePack] = normalizeExerciseImport(
      { schema_version: 4, statements: [firstUnit] },
      { idFactory: () => "id" },
    );
    expect(coursePack.title).toMatch(/^\d{12}$/);
  });

  it("rejects legacy formats without sentence context", () => {
    expect(() => normalizeExerciseImport({ schema_version: 3, statements: [] })).toThrow(
      "旧版练习请重新生成后导入",
    );
  });

  it("rejects malformed schema 4 statements", () => {
    expect(() =>
      normalizeExerciseImport({
        schema_version: 4,
        statements: [{ ...firstUnit, sentence_chinese: "" }],
      }),
    ).toThrow("备份文件包含无效练习");
  });

  it("preserves source links for repeated review rows", () => {
    const combined = {
      english: "Birdsong is good",
      context_before: "",
      context_after: ".",
      sentence_chinese: "鸟鸣很好。",
      unit_id: "0:1",
      source_unit_ids: ["0:0"],
    };
    const [pack] = normalizeExerciseImport({
      schema_version: 4,
      statements: [firstUnit, firstUnit, combined],
    });

    expect(pack.courses[0].statements[2]).toMatchObject({
      unitId: "0:1",
      sourceUnitIds: ["0:0"],
    });
  });

  it("preserves learning mode, cursor and starting occurrence in array backups", () => {
    const [pack] = normalizeExerciseImport({ schema_version: 4, statements: [firstUnit] });
    pack.courses[0].learningMode = "sentence-first";
    pack.courses[0].practiceView = "fulltext";
    pack.courses[0].sentenceFirstStartIndex = 0;
    pack.courses[0].statementIndex = 0;
    const [restored] = normalizeExerciseImport(JSON.parse(JSON.stringify([pack])));
    expect(restored.courses[0]).toMatchObject({
      learningMode: "sentence-first",
      practiceView: "fulltext",
      sentenceFirstStartIndex: 0,
      statementIndex: 0,
    });
  });

  it("preserves the latest view and lower cursor when a stale completion snapshot is saved", () => {
    const [pack] = normalizeExerciseImport({
      schema_version: 4,
      statements: [firstUnit, firstUnit],
    });
    const stale = JSON.parse(JSON.stringify(pack));
    stale.courses[0].statementIndex = 1;
    stale.courses[0].completionCount = 1;
    stale.courses[0].practiceView = "single";
    pack.courses[0].statementIndex = 0;
    pack.courses[0].learningMode = "progressive";
    pack.courses[0].practiceView = "fulltext";
    pack.courses[0].passedUnitIds = ["unit:old"];
    stale.courses[0].passedUnitIds = ["unit:new"];
    const merged = mergeLocalExerciseProgress(pack, stale);
    expect(merged.courses[0]).toMatchObject({
      statementIndex: 0,
      practiceView: "fulltext",
      learningMode: "progressive",
      completionCount: 1,
      passedUnitIds: ["unit:old", "unit:new"],
    });
    expect(pack.courses[0].completionCount).toBe(0);
  });

  it("rejects links to absent or later units", () => {
    expect(() =>
      normalizeExerciseImport({
        schema_version: 4,
        statements: [{ ...firstUnit, source_unit_ids: ["0:2"] }],
      }),
    ).toThrow("备份文件包含无效单元关系");
  });
});
