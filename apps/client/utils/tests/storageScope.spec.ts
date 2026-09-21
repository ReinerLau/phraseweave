import { describe, expect, it } from "vitest";

import { isPreviewPath, scopedStorageName } from "../storageScope";

describe("storage scope", () => {
  it("keeps production storage names unchanged", () => {
    expect(scopedStorageName("activeCourseMap", "/phraseweave/")).toBe("activeCourseMap");
  });

  it("namespaces preview storage", () => {
    expect(scopedStorageName("activeCourseMap", "/phraseweave/preview/")).toBe(
      "preview:activeCourseMap",
    );
  });

  it("matches only the preview path segment", () => {
    expect(isPreviewPath("/phraseweave/preview/course/1")).toBe(true);
    expect(isPreviewPath("/phraseweave/previewer/course/1")).toBe(false);
  });
});
