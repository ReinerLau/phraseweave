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

  it("keeps schema 2 source links when importing repeated review rows", () => {
    const [pack] = normalizeExerciseImport({
      schema_version: 2,
      statements: [
        {
          chinese: "研究人员",
          english: "Researchers",
          soundmark: "",
          unit_id: "0:0",
          source_unit_ids: [],
        },
        { chinese: "说", english: "say", soundmark: "", unit_id: "0:1", source_unit_ids: [] },
        {
          chinese: "研究人员",
          english: "Researchers",
          soundmark: "",
          unit_id: "0:0",
          source_unit_ids: [],
        },
        {
          chinese: "研究人员说",
          english: "Researchers say",
          soundmark: "",
          unit_id: "0:2",
          source_unit_ids: ["0:0", "0:1"],
        },
      ],
    });

    expect(pack.courses[0].statements[3]).toMatchObject({
      unitId: "0:2",
      sourceUnitIds: ["0:0", "0:1"],
    });
  });

  it("rejects schema 2 links to absent or later units", () => {
    expect(() =>
      normalizeExerciseImport({
        schema_version: 2,
        statements: [
          {
            chinese: "研究人员说",
            english: "Researchers say",
            soundmark: "",
            unit_id: "0:2",
            source_unit_ids: ["0:0", "0:1"],
          },
        ],
      }),
    ).toThrow("备份文件包含无效单元关系");
  });

  it("imports a schema 3 unit with one retained source", () => {
    const [pack] = normalizeExerciseImport({
      schema_version: 3,
      statements: [
        {
          chinese: "公共交通环境",
          english: "public transport environment",
          soundmark: "",
          unit_id: "0:0",
          source_unit_ids: [],
        },
        {
          chinese: "一个公共交通环境",
          english: "a public transport environment",
          soundmark: "",
          unit_id: "0:1",
          source_unit_ids: ["0:0"],
        },
      ],
    });
    expect(pack.courses[0].statements[1]).toMatchObject({
      unitId: "0:1",
      sourceUnitIds: ["0:0"],
    });
  });

  it("keeps schema 2 restricted to complete source pairs", () => {
    expect(() =>
      normalizeExerciseImport({
        schema_version: 2,
        statements: [
          {
            chinese: "公共交通环境",
            english: "public transport environment",
            soundmark: "",
            unit_id: "0:0",
            source_unit_ids: [],
          },
          {
            chinese: "一个公共交通环境",
            english: "a public transport environment",
            soundmark: "",
            unit_id: "0:1",
            source_unit_ids: ["0:0"],
          },
        ],
      }),
    ).toThrow("备份文件包含无效练习");
  });

  it("rejects a schema 3 singleton link to an absent source", () => {
    expect(() =>
      normalizeExerciseImport({
        schema_version: 3,
        statements: [
          {
            chinese: "一个公共交通环境",
            english: "a public transport environment",
            soundmark: "",
            unit_id: "0:1",
            source_unit_ids: ["0:0"],
          },
        ],
      }),
    ).toThrow("备份文件包含无效单元关系");
  });
});
