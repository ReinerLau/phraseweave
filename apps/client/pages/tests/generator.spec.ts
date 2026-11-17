import { describe, expect, it } from "vitest";
import source from "../generator.vue?raw";

describe("retired generator", () => {
  it("redirects old bookmarks to the exercise list", () => {
    expect(source).toContain('navigateTo("/course-pack", { replace: true })');
  });
});
