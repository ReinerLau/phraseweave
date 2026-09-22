import { describe, expect, it, vi } from "vitest";

import {
  createWordWidthMeasurer,
  getInputWordWidthCh,
  getWordCapacityCh,
} from "../questionInputHelper";

// 模拟真实字体：不同字符宽度不同，"0" 宽 10px（即 1ch = 10px）
const LETTER_WIDTHS: Record<string, number> = { "0": 10, i: 4, l: 4, w: 16, o: 11 };

function fakeReadWidth(text: string) {
  return text.split("").reduce((total, char) => total + (LETTER_WIDTHS[char] ?? 8), 0);
}

describe("createWordWidthMeasurer", () => {
  it("按探针实测宽度换算为 ch 单位", () => {
    const measurer = createWordWidthMeasurer(fakeReadWidth);

    expect(measurer.chWidthPx()).toBe(10);
    expect(measurer.measureCh("0")).toBe(1);
    expect(measurer.measureCh("ii")).toBe(0.8);
    expect(measurer.measureCh("wow")).toBe(4.3);
  });

  it("不同字符宽度不同的字体不会被拉平", () => {
    const measurer = createWordWidthMeasurer(fakeReadWidth);

    // i 和 w 实际宽度差 4 倍，测量结果必须保留真实差异
    expect(measurer.measureCh("wwww")).toBeGreaterThan(measurer.measureCh("iiii") * 3);
  });

  it("缓存测量结果，重复测量不再读取探针", () => {
    const readWidth = vi.fn(fakeReadWidth);
    const measurer = createWordWidthMeasurer(readWidth);

    measurer.measureCh("hello");
    const callsAfterFirstMeasure = readWidth.mock.calls.length;
    measurer.measureCh("hello");

    expect(readWidth.mock.calls.length).toBe(callsAfterFirstMeasure);
  });

  it("invalidate 后重新测量", () => {
    const readWidth = vi.fn(fakeReadWidth);
    const measurer = createWordWidthMeasurer(readWidth);

    measurer.measureCh("hello");
    measurer.invalidate();
    measurer.measureCh("hello");

    expect(readWidth.mock.calls.length).toBeGreaterThan(1);
  });

  it("探针不可用时退化为按字符数估算", () => {
    const measurer = createWordWidthMeasurer(() => 0);

    expect(measurer.chWidthPx()).toBe(0);
    expect(measurer.measureCh("because")).toBe(7);
  });
});

describe("getInputWordWidthCh", () => {
  it("按小写测量，大小写作答都能放进同一个块", () => {
    const measureCh = vi.fn((text: string) => fakeReadWidth(text) / 10);

    expect(getInputWordWidthCh("THIS", measureCh)).toBe(getInputWordWidthCh("this", measureCh));
    expect(measureCh).toHaveBeenCalledWith("this");
  });

  it("多敲一个字符宽度一定变大，截断边界是确定的", () => {
    const measureCh = (text: string) => fakeReadWidth(text) / 10;

    expect(getInputWordWidthCh("thist", measureCh)).toBeGreaterThan(
      getInputWordWidthCh("this", measureCh),
    );
  });
});

describe("getWordCapacityCh", () => {
  it("容器足够宽时容量就是目标单词实测宽度", () => {
    expect(getWordCapacityCh(7.5, 100)).toBe(7.5);
  });

  it("容器更窄时按容器宽度收窄", () => {
    expect(getWordCapacityCh(12, 10)).toBe(10);
  });

  it("容量不为负数", () => {
    expect(getWordCapacityCh(7.5, 0)).toBe(0);
  });
});
