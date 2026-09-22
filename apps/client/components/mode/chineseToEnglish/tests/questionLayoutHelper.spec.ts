import { describe, expect, it } from "vitest";

import {
  findLargestFittingFontSize,
  QUESTION_FONT_MAX_SIZE_PX,
  QUESTION_FONT_MIN_SIZE_PX,
} from "../questionLayoutHelper";

describe("findLargestFittingFontSize", () => {
  it("returns the maximum when the layout fits", () => {
    expect(findLargestFittingFontSize(() => true)).toBe(QUESTION_FONT_MAX_SIZE_PX);
  });

  it("returns the largest fitting size when the layout is constrained", () => {
    const fittingSize = findLargestFittingFontSize((fontSize) => fontSize <= 30);

    expect(fittingSize).toBeGreaterThanOrEqual(29.5);
    expect(fittingSize).toBeLessThanOrEqual(30);
  });

  it("returns the technical minimum when no size fits", () => {
    expect(findLargestFittingFontSize(() => false)).toBe(QUESTION_FONT_MIN_SIZE_PX);
  });
});
