/** Match the original generator's comma boundaries, including numeric commas. */
export function practiceSpans(sentence: string): Array<[number, number]> {
  const segments: Array<[number, number]> = [];
  function append(start: number, end: number) {
    while (start < end && /\s/.test(sentence[start])) start++;
    while (end > start && /\s/.test(sentence[end - 1])) end--;
    if (/[\p{L}\p{N}]/u.test(sentence.slice(start, end))) segments.push([start, end]);
  }
  let start = 0;
  for (let index = 0; index < sentence.length; index++) {
    if (
      sentence[index] !== "," ||
      (index > 0 &&
        index + 1 < sentence.length &&
        /\d/.test(sentence[index - 1]) &&
        /\d/.test(sentence[index + 1]))
    )
      continue;
    append(start, index);
    start = index + 1;
  }
  append(start, sentence.length);
  return segments.length > 1 ? [...segments, [0, sentence.length]] : [[0, sentence.length]];
}
