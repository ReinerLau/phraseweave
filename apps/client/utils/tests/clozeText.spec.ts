import { describe, expect, it } from "vitest";

import {
  checkClozeAnswer,
  getClozeWords,
  groupClozeTokens,
  normalizeClozeInput,
  tokenizeClozeText,
} from "../clozeText";

const sentence =
  "The new penalties will also be applied to other anti-social behaviour, such as putting feet on seats, littering, and eating or drinking on buses";

describe("cloze text", () => {
  it("preserves the original sentence and excludes its punctuation from blanks", () => {
    const tokens = tokenizeClozeText(sentence);
    expect(tokens.map((token) => token.text).join("")).toBe(sentence);
    expect(
      tokens.filter((token) => token.kind === "punctuation").map((token) => token.text),
    ).toEqual(["-", ",", ",", ","]);
    expect(getClozeWords(sentence)).toHaveLength(25);
    expect(getClozeWords(sentence).slice(9, 12)).toEqual(["anti", "social", "behaviour"]);
    expect(checkClozeAnswer(sentence, sentence)).toBe(true);
    expect(checkClozeAnswer(sentence, sentence.replaceAll(",", "").replace("-", " "))).toBe(true);
  });

  it("indexes editable runs without losing quotes, brackets, Unicode punctuation or whitespace", () => {
    const source = "  “don’t”\t(anti-social)， seats...\n";
    const tokens = tokenizeClozeText(source);
    expect(tokens.map((token) => token.text).join("")).toBe(source);
    expect(tokens.filter((token) => token.kind === "word")).toEqual([
      { kind: "word", text: "don’t", wordIndex: 0 },
      { kind: "word", text: "anti", wordIndex: 1 },
      { kind: "word", text: "social", wordIndex: 2 },
      { kind: "word", text: "seats", wordIndex: 3 },
    ]);
    expect(
      groupClozeTokens(tokens).map((group) => group.map((token) => token.text).join("")),
    ).toEqual(["“don’t”", "(anti-social)，", "seats..."]);
  });

  it("only requires apostrophes inside words and still requires currency symbols", () => {
    expect(checkClozeAnswer("‘don’t’ costs S$500, or €20.", "don't costs S$500 or €20")).toBe(true);
    expect(checkClozeAnswer("don’t", "dont")).toBe(false);
    expect(checkClozeAnswer("S$500", "S€500")).toBe(false);
    expect(checkClozeAnswer("anti-social", "antisocial")).toBe(false);
    expect(checkClozeAnswer("seats,", "seats extra")).toBe(false);
  });

  it("keeps partially typed contractions and trailing spaces usable", () => {
    expect(normalizeClozeInput("don'", ["don't"])).toBe("don'");
    expect(normalizeClozeInput("don’", ["don’t"])).toBe("don’");
    expect(normalizeClozeInput("'don't'", ["don't"])).toBe("don't");
    expect(normalizeClozeInput("anti ", ["anti", "social"])).toBe("anti ");
    expect(normalizeClozeInput("anti-", ["anti", "social"])).toBe("anti ");
    expect(normalizeClozeInput("seats,", ["seats"])).toBe("seats");
    expect(normalizeClozeInput("(anti-social)，  seats...", ["anti", "social", "seats"])).toBe(
      "anti social seats",
    );
  });

  it("does not create editable blanks for punctuation-only text", () => {
    expect(getClozeWords("— …，()")).toEqual([]);
    expect(groupClozeTokens(tokenizeClozeText(""))).toEqual([]);
    expect(checkClozeAnswer("...", "")).toBe(true);
  });
});
