import { describe, expect, it, vi } from "vitest";

import {
  createWordWidthMeasurer,
  getInputWordWidthEm,
  getWordCapacityEm,
  SUBPIXEL_SAFETY_EM,
} from "../questionInputHelper";

// 模拟真实字体（字号 10px）：不同字符宽度不同，"0" 宽 10px
const LETTER_WIDTHS: Record<string, number> = { "0": 10, i: 4, l: 4, w: 16, o: 11 };
const FONT_SIZE_PX = 10;

function fakeReadWidth(text: string) {
  return text.split("").reduce((total, char) => total + (LETTER_WIDTHS[char] ?? 8), 0);
}

function createMeasurer(readWidth: (text: string) => number = fakeReadWidth) {
  return createWordWidthMeasurer(readWidth, () => FONT_SIZE_PX);
}

describe("createWordWidthMeasurer", () => {
  it("按探针实测宽度换算为 em 单位", () => {
    const measurer = createMeasurer();

    expect(measurer.fontSizePx()).toBe(10);
    expect(measurer.measureEm("0")).toBe(1);
    expect(measurer.measureEm("ii")).toBe(0.8);
    expect(measurer.measureEm("wow")).toBe(4.3);
  });

  it("不同字符宽度不同的字体不会被拉平", () => {
    const measurer = createMeasurer();

    // i 和 w 实际宽度差 4 倍，测量结果必须保留真实差异
    expect(measurer.measureEm("wwww")).toBeGreaterThan(measurer.measureEm("iiii") * 3);
  });

  it("缓存测量结果，重复测量不再读取探针", () => {
    const readWidth = vi.fn(fakeReadWidth);
    const measurer = createMeasurer(readWidth);

    measurer.measureEm("hello");
    const callsAfterFirstMeasure = readWidth.mock.calls.length;
    measurer.measureEm("hello");

    expect(readWidth.mock.calls.length).toBe(callsAfterFirstMeasure);
  });

  it("invalidate 后重新测量", () => {
    const readWidth = vi.fn(fakeReadWidth);
    const measurer = createMeasurer(readWidth);

    measurer.measureEm("hello");
    measurer.invalidate();
    measurer.measureEm("hello");

    expect(readWidth.mock.calls.length).toBeGreaterThan(1);
  });

  it("探针不可用时退化为按字符数估算", () => {
    const measurer = createWordWidthMeasurer(
      () => 0,
      () => 0,
    );

    expect(measurer.fontSizePx()).toBe(0);
    expect(measurer.measureEm("because")).toBe(7);
  });
});

describe("getInputWordWidthEm", () => {
  it("按小写测量，大小写作答都能放进同一个块", () => {
    const measureEm = vi.fn((text: string) => fakeReadWidth(text) / FONT_SIZE_PX);

    expect(getInputWordWidthEm("THIS", measureEm)).toBe(getInputWordWidthEm("this", measureEm));
    expect(measureEm).toHaveBeenCalledWith("this");
  });

  it("多敲一个字符宽度一定变大，截断边界是确定的", () => {
    const measureEm = (text: string) => fakeReadWidth(text) / FONT_SIZE_PX;

    expect(getInputWordWidthEm("thist", measureEm)).toBeGreaterThan(
      getInputWordWidthEm("this", measureEm),
    );
  });
});

describe("getWordCapacityEm", () => {
  it("容器足够宽时容量就是目标单词实测宽度", () => {
    expect(getWordCapacityEm(7.5, 100)).toBe(7.5);
  });

  it("容器更窄时按容器宽度收窄", () => {
    expect(getWordCapacityEm(12, 10)).toBe(10);
  });

  it("容量不为负数", () => {
    expect(getWordCapacityEm(7.5, 0)).toBe(0);
  });
});

describe("SUBPIXEL_SAFETY_EM", () => {
  it("为正且小到视觉不可见，只用于抵消布局量化误差", () => {
    expect(SUBPIXEL_SAFETY_EM).toBeGreaterThan(0);
    // 0.008em：练习字号下约合 0.1–0.3px，远小于肉眼可辨的突出
    expect(SUBPIXEL_SAFETY_EM).toBeLessThan(0.01);
  });
});
