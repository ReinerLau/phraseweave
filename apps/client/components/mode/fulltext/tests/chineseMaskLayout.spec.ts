import { afterEach, describe, expect, it, vi } from "vitest";

import { measureChineseMasks } from "../chineseMaskLayout";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Chinese mask measurement", () => {
  const rect = (left: number, top: number, width: number, height: number) =>
    ({ left, top, width, height }) as DOMRect;
  function setup() {
    const container = document.createElement("div");
    container.style.cssText = "font-size:18px;line-height:1.625;font-family:sans-serif";
    Object.defineProperty(container, "clientWidth", { value: 320 });
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
      rect(0, 100, 320, 87.75),
    );
    const getClientRects = vi
      .fn()
      .mockReturnValue([
        rect(0, 105, 144, 20),
        rect(144, 105, 90, 20),
        rect(0, 134.25, 320, 20),
        rect(0, 163.5, 72, 20),
        rect(0, 163.5, 0, 20),
      ]);
    vi.spyOn(document, "createRange").mockReturnValue({
      selectNodeContents: vi.fn(),
      getClientRects,
    } as unknown as Range);
    return { container, getClientRects };
  }

  it("retains line geometry and distinct occurrence IDs, and removes all Chinese probes", () => {
    const { container } = setup();
    const text = "中文 mixed punctuation，\n换行。";
    const masks = measureChineseMasks(container, [
      { id: "first", chinese: text },
      { id: "repeated", chinese: text },
    ]);
    expect(masks.first).toEqual({
      height: 87.75,
      lines: [
        { left: 0, top: 5, width: 234, height: 20 },
        { left: 0, top: 34.25, width: 320, height: 20 },
        { left: 0, top: 63.5, width: 72, height: 20 },
      ],
    });
    expect(masks.repeated).toEqual(masks.first);
    expect(masks.repeated).not.toBe(masks.first);
    expect(document.querySelector("[data-fulltext-mask-probe]")).toBeNull();
    expect(document.body.textContent).not.toContain(text);
  });

  it("removes the probe even if measurement fails", () => {
    const { container, getClientRects } = setup();
    getClientRects.mockImplementation(() => {
      throw new Error("measurement failed");
    });
    expect(() => measureChineseMasks(container, [{ id: "row", chinese: "不可复制" }])).toThrow(
      "measurement failed",
    );
    expect(document.querySelector("[data-fulltext-mask-probe]")).toBeNull();
    expect(document.body.textContent).not.toContain("不可复制");
  });
});
