import { describe, expect, it } from "vitest";

import type { RecoverySources } from "../reviewRecovery";
import { ReviewRecovery } from "../reviewRecovery";

describe("ReviewRecovery", () => {
  const sources = new Map<string, RecoverySources>([
    ["whole", ["old", "new"]],
    ["old", ["leaf-a", "leaf-b"]],
  ]);

  it("queries single and double source units without changing the review path", () => {
    const recovery = new ReviewRecovery(
      new Map<string, RecoverySources>([...sources, ["single", ["leaf-a"]]]),
    );
    for (const id of ["whole", "old", "single"]) expect(recovery.canDecompose(id)).toBe(true);
    for (const id of ["leaf-a", "missing", undefined])
      expect(recovery.canDecompose(id)).toBe(false);
    expect(recovery.currentUnitId).toBeUndefined();
    expect(recovery.correct()).toBeUndefined();
    recovery.fail("whole");
    expect(recovery.canDecompose("old")).toBe(true);
    expect(recovery.currentUnitId).toBe("old");
    expect(recovery.correct()).toBe("new");
  });

  it("only descends further when a source is answered incorrectly", () => {
    const recovery = new ReviewRecovery(sources);
    expect(recovery.fail("whole")).toBe("old");
    expect(recovery.fail("old")).toBe("leaf-a");
    expect(recovery.correct()).toBe("leaf-b");
    expect(recovery.correct()).toBe("old");
    expect(recovery.correct()).toBe("new");
    expect(recovery.correct()).toBe("whole");
    expect(recovery.correct()).toBeUndefined();
  });

  it("keeps an indivisible unit in place and reopens a failed retry", () => {
    const recovery = new ReviewRecovery(sources);
    recovery.fail("whole");
    expect(recovery.fail("old")).toBe("leaf-a");
    expect(recovery.fail("leaf-a")).toBe("leaf-a");
    recovery.correct();
    recovery.correct();
    expect(recovery.fail("old")).toBe("leaf-a");
  });

  it("cancels the pending path on manual navigation", () => {
    const recovery = new ReviewRecovery(sources);
    recovery.fail("whole");
    recovery.cancel();
    expect(recovery.currentUnitId).toBeUndefined();
    expect(recovery.correct()).toBeUndefined();
  });

  it("retries after the only retained source and can reopen a failed retry", () => {
    const recovery = new ReviewRecovery(
      new Map<string, RecoverySources>([["with-article", ["core"]]]),
    );
    expect(recovery.fail("with-article")).toBe("core");
    expect(recovery.correct()).toBe("with-article");
    expect(recovery.fail("with-article")).toBe("core");
    expect(recovery.correct()).toBe("with-article");
    expect(recovery.correct()).toBeUndefined();
  });
});
