import type { Statement } from "../../exercise";

export const pneumonicSentence =
  "Local reports say she may have broken a test tube of pneumonic plague bacteria";

// Reconstruct the eleven-level path observed in the supplied learning-units file.
export const pneumonicReturnPath = [
  ["0:7", "pneumonic plague bacteria"],
  ["0:9", "of pneumonic plague bacteria"],
  ["0:14", "tube of pneumonic plague bacteria"],
  ["0:15", "test tube of pneumonic plague bacteria"],
  ["0:16", "a test tube of pneumonic plague bacteria"],
  ["0:22", "broken a test tube of pneumonic plague bacteria"],
  ["0:23", "have broken a test tube of pneumonic plague bacteria"],
  ["0:24", "may have broken a test tube of pneumonic plague bacteria"],
  ["0:25", "she may have broken a test tube of pneumonic plague bacteria"],
  ["0:28", "say she may have broken a test tube of pneumonic plague bacteria"],
  ["0:29", pneumonicSentence],
] as const;

export function deepPneumonicStatements(): Statement[] {
  const statements: Statement[] = [];
  function add(
    id: string,
    english: string,
    sourceUnitIds: Statement["sourceUnitIds"] = [],
    start = pneumonicSentence.indexOf(english),
  ) {
    const statement: Statement = {
      id,
      unitId: id,
      order: statements.length + 1,
      english,
      contextBefore: pneumonicSentence.slice(0, start),
      contextAfter: pneumonicSentence.slice(start + english.length),
      sentenceChinese: "当地报道说她可能打破了一支装有肺鼠疫细菌的试管。",
      sourceUnitIds,
    };
    statements.push(statement);
    return statement;
  }
  add("0:3", "pneumonic");
  add("0:4", "plague");
  add("0:5", "bacteria");
  add("0:6", "plague bacteria", ["0:4", "0:5"]);
  let previous = add("0:7", pneumonicReturnPath[0][1], ["0:3", "0:6"]);
  for (const [id, english] of pneumonicReturnPath.slice(1)) {
    const prefix = add(
      `prefix:${id}`,
      english.slice(0, english.length - previous.english.length).trimEnd(),
      [],
      pneumonicSentence.length - english.length,
    );
    previous = add(id, english, [prefix.unitId!, previous.unitId!]);
  }
  return statements;
}
