import type { Statement } from "~/store/exercise";
import type { RecoverySources } from "~/store/reviewRecovery";
import { normalizeClozeInput, normalizeClozeWord, tokenizeClozeText } from "./clozeText";

function wordSpans(statement: Statement) {
  let offset = statement.contextBefore!.length;
  return tokenizeClozeText(statement.english).flatMap((token) => {
    const start = offset;
    offset += token.text.length;
    return token.kind === "word" ? [{ text: token.text, start, end: offset }] : [];
  });
}

function sentenceText(statement: Statement) {
  if (typeof statement.contextBefore !== "string" || typeof statement.contextAfter !== "string")
    return undefined;
  return statement.contextBefore + statement.english + statement.contextAfter;
}

/** Undefined preserves the original review path when positional evidence is incomplete. */
export function selectRecoverySources(
  statement: Statement,
  input: string | undefined,
  sourceUnitIds: RecoverySources,
  units: ReadonlyMap<string, Statement>,
): RecoverySources | undefined {
  const sentence = sentenceText(statement);
  if (input === undefined || sentence === undefined) return undefined;

  const words = wordSpans(statement);
  const answer = normalizeClozeInput(
    input,
    words.map((word) => word.text),
  ).split(" ");
  const errors = words.filter(
    (word, index) => normalizeClozeWord(word.text) !== normalizeClozeWord(answer[index] ?? ""),
  );
  if (!errors.length) return undefined;

  const start = statement.contextBefore!.length;
  const end = start + statement.english.length;
  const sourceWords: { id: string; spans: ReturnType<typeof wordSpans> }[] = [];
  for (const id of sourceUnitIds) {
    const source = units.get(id);
    if (!source || sentenceText(source) !== sentence) return undefined;
    const sourceStart = source.contextBefore!.length;
    const sourceEnd = sourceStart + source.english.length;
    if (sourceStart < start || sourceEnd > end) return undefined;
    const spans = wordSpans(source);
    // Sources must cover complete answer tokens, including internal apostrophes.
    if (
      !spans.length ||
      spans.some(
        (span) => !words.some((word) => word.start === span.start && word.end === span.end),
      )
    )
      return undefined;
    sourceWords.push({ id, spans });
  }

  const covers = (spans: ReturnType<typeof wordSpans>, error: (typeof errors)[number]) =>
    spans.some((span) => span.start === error.start && span.end === error.end);
  if (errors.some((error) => !sourceWords.some((source) => covers(source.spans, error))))
    return undefined;

  const selected = sourceWords
    .filter((source) => errors.some((error) => covers(source.spans, error)))
    .map((source) => source.id);
  return selected.length === 1 ? [selected[0]] : [selected[0], selected[1]];
}
