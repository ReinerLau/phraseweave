import { describe, expect, it } from "vitest";

import { extractHttpErrorMessages } from "../http";

describe("HTTP error messages", () => {
  it("uses a fallback for non-JSON responses", () => {
    expect(
      extractHttpErrorMessages({
        response: {
          status: 404,
          data: "<!doctype html>",
        },
      }),
    ).toEqual(["请求失败，请稍后再试"]);
  });

  it("keeps non-empty API messages", () => {
    expect(
      extractHttpErrorMessages({
        response: {
          status: 400,
          data: {
            message: ["第一条错误", "", 42, "第二条错误"],
          },
        },
      }),
    ).toEqual(["第一条错误", "第二条错误"]);
  });
});
