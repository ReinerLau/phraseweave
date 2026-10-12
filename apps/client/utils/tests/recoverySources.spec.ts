import { describe, expect, it } from "vitest";

import type { Statement } from "~/store/exercise";
import type { RecoverySources } from "~/store/reviewRecovery";
import { buildRecoverySteps } from "../recoverySources";

function unit(sentence: string, id: string, start: number, end: number): Statement {
  return {
    id,
    unitId: id,
    order: 1,
    english: sentence.slice(start, end),
    contextBefore: sentence.slice(0, start),
    contextAfter: sentence.slice(end),
  };
}

function select(target: Statement, input: string | undefined, sources: Statement[]) {
  return buildRecoverySteps(
    target,
    input,
    new Map([target, ...sources].map((source) => [source.unitId!, source])),
    new Map([[target.unitId!, sources.map((source) => source.unitId!) as RecoverySources]]),
  );
}

describe("postorder recovery planning", () => {
  const sentence = "Local reports say she may have broken a test tube of pneumonic plague bacteria";
  const split = sentence.indexOf("pneumonic");
  const whole = unit(sentence, "whole", 0, sentence.length);
  const prefix = unit(sentence, "prefix", 0, split - 1);
  const tail = unit(sentence, "tail", split, sentence.length);

  it.each([sentence.slice(0, split - 1), sentence.replace("pneumonic", "pneumatic")])(
    "skips the correct prefix for a failed or unfilled tail: %s",
    (input) => {
      expect(select(whole, input, [prefix, tail])).toEqual(["tail", "whole"]);
    },
  );

  it.each(["", sentence.replace("Local", "Wrong").replace("pneumonic", "wrong")])(
    "keeps all affected branches in source order: %s",
    (input) => {
      expect(select(whole, input, [tail, prefix])).toEqual(["tail", "prefix", "whole"]);
    },
  );

  it("identifies repeated words by their original occurrence", () => {
    const text = "go go.";
    const target = unit(text, "whole", 0, text.length);
    const sources = [unit(text, "first", 0, 2), unit(text, "second", 3, 5)];
    expect(select(target, "go no", sources)).toEqual(["second", "whole"]);
    expect(select(target, "no go", sources)).toEqual(["first", "whole"]);
  });

  it("retains every overlapping source containing an error", () => {
    const text = "A B C.";
    const target = unit(text, "whole", 0, text.length);
    const sources = [unit(text, "AB", 0, 3), unit(text, "BC", 2, 5)];
    expect(select(target, "A X C", sources)).toEqual(["AB", "BC", "whole"]);
    expect(select(target, "A B X", sources)).toEqual(["BC", "whole"]);
  });

  it("uses cloze normalization for casing, apostrophes and fixed punctuation", () => {
    const text = "Don’t be anti-social.";
    const target = unit(text, "whole", 0, text.length);
    const sources = [unit(text, "prefix", 0, 13), unit(text, "social", 14, 20)];
    expect(select(target, "DON'T be anti-bad.", sources)).toEqual(["social", "whole"]);
    expect(select(target, "Dont be anti social", sources)).toEqual(["prefix", "whole"]);
    expect(select(target, "don't be anti-social.", sources)).toBeUndefined();
  });

  it("supports a single retained source and falls back for an uncovered error", () => {
    const text = "the USA";
    const target = unit(text, "whole", 0, text.length);
    const sources = [unit(text, "USA", 4, 7)];
    expect(select(target, "the UK", sources)).toEqual(["USA", "whole"]);
    expect(select(target, "a USA", sources)).toBeUndefined();
    expect(select(target, "a UK", sources)).toBeUndefined();
  });

  it("uses string offsets consistently with Unicode context and nested targets", () => {
    const text = "😀 A B.";
    const target = unit(text, "AB", 3, 6);
    const sources = [unit(text, "A", 3, 4), unit(text, "B", 5, 6)];
    expect(select(target, "A X", sources)).toEqual(["B", "AB"]);
  });

  it("falls back without a snapshot or complete original context", () => {
    expect(select(whole, undefined, [prefix, tail])).toBeUndefined();
    expect(select({ ...whole, contextBefore: undefined }, "", [prefix, tail])).toBeUndefined();
    expect(select(whole, "", [prefix, { ...tail, contextAfter: undefined }])).toBeUndefined();
  });

  it("falls back when source identity or sentence context cannot be resolved", () => {
    expect(
      buildRecoverySteps(whole, "", new Map([["whole", whole]]), new Map([["whole", ["missing"]]])),
    ).toBeUndefined();
    expect(select(whole, "", [{ ...prefix, contextAfter: "different" }, tail])).toBeUndefined();
  });

  it("falls back when a source is outside the target or splits an answer token", () => {
    const text = "A don’t B";
    const target = unit(text, "middle", 2, 7);
    expect(select(target, "wrong", [unit(text, "outside", 0, 7)])).toBeUndefined();
    expect(select(target, "wrong", [unit(text, "partial", 2, 5)])).toBeUndefined();
  });

  function overlappingGraph() {
    const text = "A B C.";
    const rows = [
      unit(text, "A", 0, 1),
      unit(text, "B", 2, 3),
      unit(text, "C", 4, 5),
      unit(text, "AB", 0, 3),
      unit(text, "BC", 2, 5),
      unit(text, "whole", 0, text.length),
    ];
    const graph = new Map<string, RecoverySources>([
      ["AB", ["A", "B"]],
      ["BC", ["B", "C"]],
      ["whole", ["AB", "BC"]],
    ]);
    return { target: rows.at(-1)!, units: new Map(rows.map((row) => [row.unitId!, row])), graph };
  }

  it("deduplicates shared leaves while retaining both affected combinations", () => {
    const { target, units, graph } = overlappingGraph();
    expect(buildRecoverySteps(target, "A X C", units, graph)).toEqual(["B", "AB", "BC", "whole"]);
    expect(buildRecoverySteps(target, "", units, graph)).toEqual([
      "A",
      "B",
      "AB",
      "C",
      "BC",
      "whole",
    ]);
  });

  it("falls back when a deeper relationship does not cover an error", () => {
    const { target, units, graph } = overlappingGraph();
    graph.set("AB", ["A"]);
    expect(buildRecoverySteps(target, "A X C", units, graph)).toBeUndefined();
  });

  it("falls back for missing descendants, cycles or unvalidated relationships", () => {
    const { target, units, graph } = overlappingGraph();
    graph.set("AB", ["missing"]);
    expect(buildRecoverySteps(target, "A X C", units, graph)).toBeUndefined();
    graph.set("AB", ["AB"]);
    expect(buildRecoverySteps(target, "A X C", units, graph)).toBeUndefined();
    graph.delete("AB");
    units.get("AB")!.sourceUnitIds = ["A", "B"];
    expect(buildRecoverySteps(target, "A X C", units, graph)).toBeUndefined();
  });
});
