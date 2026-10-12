import type { Statement } from "~/store/exercise";
import type { RecoverySources } from "~/store/reviewRecovery";
import {
  getClozeWords,
  normalizeClozeInput,
  normalizeClozeWord,
  tokenizeClozeText,
} from "./clozeText";

function wordSpans(statement: Statement) {
  let offset = statement.contextBefore!.length;
  return tokenizeClozeText(statement.english).flatMap((token) => {
    const start = offset;
    offset += token.text.length;
    if (token.kind !== "word") return [];
    // The generator can split woman's into woman + 's. Keep cloze answer indices,
    // but position each apostrophe-separated part so both source units can match.
    return [...token.text.matchAll(/[^'‘’]+/gu)].map((part, partIndex) => ({
      text: part[0],
      start: start + part.index!,
      end: start + part.index! + part[0].length,
      wordIndex: token.wordIndex,
      partIndex,
    }));
  });
}

function sentenceText(statement: Statement) {
  if (typeof statement.contextBefore !== "string" || typeof statement.contextAfter !== "string")
    return undefined;
  return statement.contextBefore + statement.english + statement.contextAfter;
}

/** Undefined preserves the original review path when positional evidence is incomplete. */
export function buildRecoverySteps(
  statement: Statement,
  input: string | undefined,
  units: ReadonlyMap<string, Statement>,
  sourcesByUnitId: ReadonlyMap<string, RecoverySources>,
): string[] | undefined {
  const sentence = sentenceText(statement);
  const targetId = statement.unitId;
  if (input === undefined || sentence === undefined || !targetId || !sourcesByUnitId.has(targetId))
    return undefined;

  const words = wordSpans(statement);
  const targetWords = getClozeWords(statement.english);
  const answer = normalizeClozeInput(input, targetWords).split(" ");
  const errors = words.filter((word) => {
    const expectedParts = normalizeClozeWord(targetWords[word.wordIndex]).split("'");
    const answerParts = normalizeClozeWord(answer[word.wordIndex] ?? "").split("'");
    // A missing/extra apostrophe cannot reliably identify just one part.
    return (
      expectedParts.length !== answerParts.length ||
      normalizeClozeWord(word.text) !== answerParts[word.partIndex]
    );
  });
  if (!errors.length) return undefined;

  const start = statement.contextBefore!.length;
  const end = start + statement.english.length;
  const spanKey = (word: (typeof words)[number]) => `${word.start}:${word.end}`;
  const targetSpans = new Set(words.map(spanKey));
  const errorSpans = new Set(errors.map(spanKey));
  const visited = new Set<string>();
  const visiting = new Set<string>();
  const steps: string[] = [];

  function positionedUnit(id: string, parentStart: number, parentEnd: number) {
    const source = units.get(id);
    if (!source || sentenceText(source) !== sentence) return undefined;
    const sourceStart = source.contextBefore!.length;
    const sourceEnd = sourceStart + source.english.length;
    if (sourceStart < parentStart || sourceEnd > parentEnd) return undefined;
    const spans = wordSpans(source);
    // Sources must cover complete words or their apostrophe-separated parts.
    if (!spans.length || spans.some((span) => !targetSpans.has(spanKey(span)))) return undefined;
    return { id, source, start: sourceStart, end: sourceEnd, spans };
  }

  function visit(unit: NonNullable<ReturnType<typeof positionedUnit>>): boolean {
    const affected = unit.spans.filter((span) => errorSpans.has(spanKey(span)));
    if (!affected.length || visited.has(unit.id)) return true;
    if (visiting.has(unit.id)) return false;
    visiting.add(unit.id);

    const sources = sourcesByUnitId.get(unit.id);
    if (sources) {
      const children: NonNullable<ReturnType<typeof positionedUnit>>[] = [];
      for (const id of sources) {
        const child = positionedUnit(id, unit.start, unit.end);
        if (!child) return false;
        children.push(child);
      }
      const covered = new Set(children.flatMap((child) => child.spans.map(spanKey)));
      if (affected.some((span) => !covered.has(spanKey(span)))) return false;
      for (const child of children) {
        if (!visit(child)) return false;
      }
    } else if (unit.source.sourceUnitIds?.length) {
      // An unvalidated relationship is not evidence that this is a leaf.
      return false;
    }

    visiting.delete(unit.id);
    visited.add(unit.id);
    steps.push(unit.id);
    return true;
  }

  const target = positionedUnit(targetId, start, end);
  if (!target || target.start !== start || target.end !== end || !visit(target)) return undefined;
  return steps;
}
