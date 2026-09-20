import { describe, expect, it } from "vitest";

import { parseTransferQr } from "../transferQr";

const currentOrigin = "https://phraseweave.example";
const roomToken = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

describe("parseTransferQr", () => {
  it("parses the current receive link format", () => {
    expect(parseTransferQr(`${currentOrigin}/receive?room=${roomToken}`, currentOrigin)).toEqual({
      roomToken,
    });
  });

  it("rejects links from another origin or another path", () => {
    expect(
      parseTransferQr(`https://attacker.example/receive?room=${roomToken}`, currentOrigin),
    ).toBe(undefined);
    expect(parseTransferQr(`${currentOrigin}/course-pack?room=${roomToken}`, currentOrigin)).toBe(
      undefined,
    );
  });

  it("rejects a missing or malformed room token", () => {
    expect(parseTransferQr(`${currentOrigin}/receive`, currentOrigin)).toBe(undefined);
    expect(parseTransferQr(`${currentOrigin}/receive?room=short-token`, currentOrigin)).toBe(
      undefined,
    );
  });
});
