export const QUESTION_FONT_MAX_SIZE_PX = 36;
export const QUESTION_FONT_MIN_SIZE_PX = 8;

/**
 * Finds the largest font size that satisfies the current layout constraints.
 * The fit predicate is expected to be monotonic: if a size fits, every smaller
 * size should also fit.
 */
export function findLargestFittingFontSize(
  fits: (fontSize: number) => boolean,
  minSize = QUESTION_FONT_MIN_SIZE_PX,
  maxSize = QUESTION_FONT_MAX_SIZE_PX,
  iterations = 8,
) {
  if (fits(maxSize)) return maxSize;
  if (!fits(minSize)) return minSize;

  let lower = minSize;
  let upper = maxSize;

  for (let index = 0; index < iterations; index++) {
    const middle = (lower + upper) / 2;
    if (fits(middle)) {
      lower = middle;
    } else {
      upper = middle;
    }
  }

  return lower;
}
