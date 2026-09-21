import { describe, expect, it } from "vitest";

import { formatBuildTimestamp } from "../buildTimestamp";

describe("formatBuildTimestamp", () => {
  it("formats an instant in China Standard Time", () => {
    expect(formatBuildTimestamp(new Date("2026-09-21T00:00:00.000Z"))).toBe("20260921-080000");
  });

  it("handles crossing into the next day in China", () => {
    expect(formatBuildTimestamp(new Date("2026-09-21T16:00:00.000Z"))).toBe("20260922-000000");
  });
});
