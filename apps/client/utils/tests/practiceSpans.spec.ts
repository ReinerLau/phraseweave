import { describe, expect, it } from "vitest";

import { practiceSpans } from "../practiceSpans";

describe("practiceSpans", () => {
  it("splits nonempty comma parts while keeping numeric commas", () => {
    const source = ", Bring 1,000 books,, ... , then leave, please.";
    expect(practiceSpans(source).map(([start, end]) => source.slice(start, end))).toEqual([
      "Bring 1,000 books",
      "then leave",
      "please.",
      source,
    ]);
  });

  it("uses one whole step without a separating comma", () => {
    expect(practiceSpans("Birds sing.")).toEqual([[0, 11]]);
  });
});
