import { afterEach, describe, expect, it, vi } from "vitest";

import { measureTextMasks } from "../textMaskLayout";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("text mask measurement", () => {
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

  it("retains line geometry and distinct occurrence IDs, and removes all text probes", () => {
    const { container } = setup();
    const text = "中文 mixed punctuation，\n换行。";
    const masks = measureTextMasks(container, [
      { id: "first", text },
      { id: "repeated", text },
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
    expect(() => measureTextMasks(container, [{ id: "row", text: "不可复制" }])).toThrow(
      "measurement failed",
    );
    expect(document.querySelector("[data-fulltext-mask-probe]")).toBeNull();
    expect(document.body.textContent).not.toContain("不可复制");
  });

  it("retains different English widths and remeasures wrapping at a narrower width", () => {
    const container = document.createElement("div");
    let containerWidth = 120;
    Object.defineProperty(container, "clientWidth", { get: () => containerWidth });
    const lineWidths = (text: string) => {
      const charactersPerLine = Math.floor(containerWidth / 10);
      const widths: number[] = [];
      for (let offset = 0; offset < text.length; offset += charactersPerLine)
        widths.push(Math.min(charactersPerLine, text.length - offset) * 10);
      return widths;
    };
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (
      this: HTMLElement,
    ) {
      return rect(0, 100, containerWidth, lineWidths(this.textContent ?? "").length * 20);
    });
    let selectedText = "";
    const englishFonts: boolean[] = [];
    vi.spyOn(document, "createRange").mockReturnValue({
      selectNodeContents: (node: Node) => {
        selectedText = node.textContent ?? "";
        englishFonts.push((node as HTMLElement).classList.contains("practice-english"));
      },
      getClientRects: () =>
        lineWidths(selectedText).map((width, index) => rect(0, 105 + index * 20, width, 20)),
    } as unknown as Range);
    const sentences = [
      { id: "short", text: "Cat.", english: true },
      { id: "long", text: "A sentence long enough to wrap.", english: true },
    ];

    const narrow = measureTextMasks(container, sentences);
    expect(narrow.short.lines.map((line) => line.width)).toEqual([40]);
    expect(narrow.long.lines.length).toBeGreaterThan(1);
    expect(narrow.long.height).toBeGreaterThan(narrow.short.height);

    containerWidth = 400;
    const wide = measureTextMasks(container, sentences);
    expect(wide.short.lines.map((line) => line.width)).toEqual([40]);
    expect(wide.long.lines).toHaveLength(1);
    expect(wide.long.lines[0].width).toBeGreaterThan(wide.short.lines[0].width);
    expect(englishFonts).toEqual([true, true, true, true]);
  });
});
