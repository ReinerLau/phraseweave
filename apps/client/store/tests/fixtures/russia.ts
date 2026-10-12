import type { Statement } from "../../exercise";

export const russiaSentence =
  'Russia said the woman\'s death was from "pneumonia of an unknown origin" and not plague.';

// Unit boundaries and composition edges from the reported exercise.
const units: [string, number, number, string[]][] = [
  ["2:0", 12, 15, []],
  ["2:1", 21, 23, []],
  ["2:2", 16, 21, []],
  ["2:3", 12, 21, ["2:0", "2:2"]],
  ["2:4", 16, 23, ["2:2", "2:1"]],
  ["2:5", 12, 23, ["2:3", "2:4"]],
  ["2:6", 24, 29, []],
  ["2:7", 12, 29, ["2:5", "2:6"]],
  ["2:8", 53, 55, []],
  ["2:9", 56, 63, []],
  ["2:10", 64, 70, []],
  ["2:11", 56, 70, ["2:9", "2:10"]],
  ["2:12", 53, 70, ["2:8", "2:11"]],
  ["2:13", 50, 52, []],
  ["2:14", 50, 70, ["2:13", "2:12"]],
  ["2:15", 40, 49, []],
  ["2:16", 40, 70, ["2:15", "2:14"]],
  ["2:17", 76, 79, []],
  ["2:18", 80, 86, []],
  ["2:19", 76, 86, ["2:17", "2:18"]],
  ["2:20", 72, 75, []],
  ["2:21", 34, 38, []],
  ["2:22", 34, 70, ["2:21", "2:16"]],
  ["2:23", 34, 75, ["2:22", "2:20"]],
  ["2:24", 34, 86, ["2:23", "2:19"]],
  ["2:25", 30, 33, []],
  ["2:26", 12, 33, ["2:7", "2:25"]],
  ["2:27", 30, 86, ["2:25", "2:24"]],
  ["2:28", 12, 86, ["2:26", "2:27"]],
  ["2:29", 0, 6, []],
  ["2:30", 7, 11, []],
  ["2:31", 0, 11, ["2:29", "2:30"]],
  ["2:32", 7, 86, ["2:30", "2:28"]],
  ["2:33", 0, 87, ["2:31", "2:32"]],
];

export function russiaStatements(): Statement[] {
  return units.map(([unitId, start, end, sourceUnitIds], index) => ({
    id: unitId,
    unitId,
    order: index + 1,
    english: russiaSentence.slice(start, end),
    contextBefore: russiaSentence.slice(0, start),
    contextAfter: russiaSentence.slice(end),
    sentenceChinese: "俄罗斯称这名女子死于不明原因的肺炎，而非鼠疫。",
    sourceUnitIds: sourceUnitIds as Statement["sourceUnitIds"],
  }));
}
