import type { Statement } from "~/store/exercise";

export type LearningMode = "progressive" | "sentence-first";

export interface SentenceGroup {
  start: number;
  end: number;
}

const punctuationContext = /^[\p{P}\s]*$/u;

/** Generated sentences end with their full-span unit. Keep occurrences, not text identities. */
export function groupExerciseSentences(statements: Statement[]): SentenceGroup[] | undefined {
  if (!statements.length) return undefined;
  const groups: SentenceGroup[] = [];
  const seenUnits = new Set<string>();
  let start = 0;
  for (let end = 0; end < statements.length; end++) {
    const whole = statements[end];
    if (
      typeof whole.contextBefore !== "string" ||
      typeof whole.contextAfter !== "string" ||
      !punctuationContext.test(whole.contextBefore + whole.contextAfter)
    )
      continue;
    const sentenceText = whole.contextBefore + whole.english + whole.contextAfter;
    const units = new Map<string, Statement>();
    for (let index = start; index <= end; index++) {
      const unit = statements[index];
      if (
        !unit.unitId ||
        seenUnits.has(unit.unitId) ||
        typeof unit.contextBefore !== "string" ||
        typeof unit.contextAfter !== "string" ||
        unit.contextBefore + unit.english + unit.contextAfter !== sentenceText ||
        !Array.isArray(unit.sourceUnitIds)
      )
        return undefined;
      const first = units.get(unit.unitId);
      if (first) {
        if (
          first.english !== unit.english ||
          first.contextBefore !== unit.contextBefore ||
          first.contextAfter !== unit.contextAfter ||
          JSON.stringify(first.sourceUnitIds) !== JSON.stringify(unit.sourceUnitIds)
        )
          return undefined;
      } else {
        if (unit.sourceUnitIds.some((id) => !units.has(id))) return undefined;
        units.set(unit.unitId, unit);
      }
    }
    for (const id of units.keys()) seenUnits.add(id);
    groups.push({ start, end });
    start = end + 1;
  }
  return start === statements.length ? groups : undefined;
}

export function findRecoveryOccurrence(
  statements: Statement[],
  unitId: string,
  baseIndex: number,
): number | undefined {
  for (let index = baseIndex - 1; index >= 0; index--) {
    if (statements[index].unitId === unitId) return index;
  }
  return undefined;
}

export function sentenceFirstIndices(groups: SentenceGroup[], startIndex?: number): number[] {
  const indices: number[] = [];
  for (const group of groups) {
    if (startIndex !== undefined && startIndex >= group.start && startIndex < group.end) {
      indices.push(startIndex);
    }
    indices.push(group.end);
  }
  return indices;
}
