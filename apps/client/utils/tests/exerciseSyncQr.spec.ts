import { describe, expect, it } from "vitest";

import { parseExerciseSyncQr } from "../exerciseSyncQr";

const currentOrigin = "https://phraseweave.example";
const roomToken = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

describe("parseExerciseSyncQr", () => {
  it("parses the current receive link format", () => {
    expect(
      parseExerciseSyncQr(`${currentOrigin}/receive?room=${roomToken}`, currentOrigin),
    ).toEqual({
      roomToken,
    });
  });

  it("rejects links from another origin or another path", () => {
    expect(
      parseExerciseSyncQr(`https://attacker.example/receive?room=${roomToken}`, currentOrigin),
    ).toBe(undefined);
    expect(
      parseExerciseSyncQr(`${currentOrigin}/course-pack?room=${roomToken}`, currentOrigin),
    ).toBe(undefined);
  });

  it("rejects a missing or malformed room token", () => {
    expect(parseExerciseSyncQr(`${currentOrigin}/receive`, currentOrigin)).toBe(undefined);
    expect(parseExerciseSyncQr(`${currentOrigin}/receive?room=short-token`, currentOrigin)).toBe(
      undefined,
    );
  });
});
