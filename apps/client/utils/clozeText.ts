export interface ClozeWordToken {
  kind: "word";
  text: string;
  wordIndex: number;
}

export type ClozeToken = ClozeWordToken | { kind: "punctuation" | "whitespace"; text: string };

const punctuation = /\p{P}/u;
const whitespace = /\s/u;
const wordCharacter = /[\p{L}\p{N}\p{M}]/u;
const apostrophe = /['‘’]/u;
const disallowedInput = /[\p{Cc}\p{Script=Han}]|[^\S ]/gu;

function isInternalApostrophe(characters: string[], index: number) {
  return (
    apostrophe.test(characters[index]) &&
    wordCharacter.test(characters[index - 1] ?? "") &&
    wordCharacter.test(characters[index + 1] ?? "")
  );
}

/** Keep the original text intact while giving only editable runs an answer index. */
export function tokenizeClozeText(text: string): ClozeToken[] {
  const tokens: ClozeToken[] = [];
  const characters = [...text];
  let wordIndex = 0;

  characters.forEach((character, index) => {
    const kind = whitespace.test(character)
      ? "whitespace"
      : punctuation.test(character) && !isInternalApostrophe(characters, index)
        ? "punctuation"
        : "word";
    const previous = tokens[tokens.length - 1];
    if (previous?.kind === kind) {
      previous.text += character;
    } else {
      tokens.push(
        kind === "word"
          ? { kind, text: character, wordIndex: wordIndex++ }
          : { kind, text: character },
      );
    }
  });

  return tokens;
}

export function getClozeWords(text: string) {
  return tokenizeClozeText(text)
    .filter((token) => token.kind === "word")
    .map((token) => token.text);
}

/** Whitespace separates layout groups; punctuation stays attached to its neighbours. */
export function groupClozeTokens(tokens: ClozeToken[]) {
  const groups: ClozeToken[][] = [];
  let group: ClozeToken[] = [];
  for (const token of tokens) {
    if (token.kind === "whitespace") {
      if (group.length) groups.push(group);
      group = [];
    } else {
      group.push(token);
    }
  }
  if (group.length) groups.push(group);
  return groups;
}

export function sanitizeQuestionInput(value: string) {
  return value.replace(disallowedInput, "");
}

export function containsAllowedQuestionCharacter(value: string) {
  return [...sanitizeQuestionInput(value)].some(
    (character) =>
      character !== " " && (!punctuation.test(character) || apostrophe.test(character)),
  );
}

/** Accept either spaced answers or pasted source text, without requiring its punctuation. */
export function normalizeClozeInput(value: string, targetWords: string[]) {
  const characters = [...sanitizeQuestionInput(value)];
  let result = "";
  let pendingSeparator = false;

  characters.forEach((character, index) => {
    if (character === " ") {
      if (!result.endsWith(" ")) result += " ";
      pendingSeparator = false;
      return;
    }

    // A partially typed contraction must keep its apostrophe before the next letter arrives.
    let unfinishedApostrophe = false;
    if (
      apostrophe.test(character) &&
      index === characters.length - 1 &&
      !pendingSeparator &&
      wordCharacter.test(characters[index - 1] ?? "")
    ) {
      const currentWords = result.split(" ");
      const currentWord = currentWords[currentWords.length - 1];
      const targetWord = targetWords[currentWords.length - 1] ?? "";
      unfinishedApostrophe =
        (currentWord.match(/['‘’]/g)?.length ?? 0) < (targetWord.match(/['‘’]/g)?.length ?? 0);
    }

    if (
      punctuation.test(character) &&
      !isInternalApostrophe(characters, index) &&
      !unfinishedApostrophe
    ) {
      pendingSeparator = result.length > 0 && !result.endsWith(" ");
      return;
    }

    if (pendingSeparator) result += " ";
    pendingSeparator = false;
    result += character;
  });

  // Typed punctuation can move to the next blank just like a space; final punctuation adds no blank.
  if (pendingSeparator && result.split(" ").length < targetWords.length) result += " ";
  return result;
}

export function normalizeClozeWord(word: string) {
  return word.toLocaleLowerCase().replace(/[‘’]/g, "'");
}

export function checkClozeAnswer(source: string, input: string) {
  const words = getClozeWords(source);
  const normalizedInput = normalizeClozeInput(input, words);
  const answer = normalizedInput ? normalizedInput.split(" ") : [];
  return (
    answer.length === words.length &&
    words.every((word, index) => normalizeClozeWord(word) === normalizeClozeWord(answer[index]))
  );
}
