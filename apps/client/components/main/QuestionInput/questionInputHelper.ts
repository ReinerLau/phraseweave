import type { Ref } from "vue";

import { onMounted, onUnmounted, ref } from "vue";

const inputEl = ref<HTMLInputElement>();
const focusing = ref(true);

export function useQuestionInput() {
  function focusInput() {
    focusing.value = true;
    inputEl.value?.focus();
  }

  function blurInput() {
    focusing.value = false;
    inputEl.value?.blur();
  }

  function setInputCursorPosition(position: number) {
    inputEl.value?.setSelectionRange(position, position);
  }

  function getInputCursorPosition() {
    return inputEl.value?.selectionStart || 0;
  }

  return {
    inputEl,
    focusing,
    focusInput,
    blurInput,
    setInputCursorPosition,
    getInputCursorPosition,
  };
}

/**
 * 输入块宽度的安全余量，单位 em（随字号缩放）。
 *
 * 宽度与文字完全相等时，浏览器布局量化（1/64px）可能让末尾字符被挤到第二行；
 * 0.008em 在练习字号下约合 0.1–0.3px，视觉不可见，但足以覆盖量化误差。
 *
 * 注意：宽度必须用 em 而不是 ch —— CSS 的 ch 取自字体度量里的 '0' 宽度，
 * 与 '0' 字形的实际布局宽度存在约 1–2% 的系统偏差，用 ch 会让块宽整体偏窄。
 */
export const SUBPIXEL_SAFETY_EM = 0.008;

export interface WordWidthMeasurer {
  /** 测量文本在当前字体下的宽度，单位 em（文本像素宽 / 当前字号） */
  measureEm(text: string): number;
  /** 探针元素当前的字号（px） */
  fontSizePx(): number;
  /** 字体变化（如字体加载完成）后清空缓存，下次测量重新读取探针 */
  invalidate(): void;
}

/**
 * 基于真实渲染测量文本宽度。
 *
 * readWidth / readFontSize 由组件注入：把文本写入隐藏探针元素后读取实际渲染宽度，
 * 因此测量结果与输入块里显示的字形完全一致，不再依赖字符宽度估算表。
 * 结果以 em 表达，既避开 ch 单位的度量偏差，又能随字号自适应缩放。
 */
export function createWordWidthMeasurer(
  readWidth: (text: string) => number,
  readFontSize: () => number,
): WordWidthMeasurer {
  const cache = new Map<string, number>();

  function fontSizePx() {
    return readFontSize();
  }

  function measureEm(text: string): number {
    const cached = cache.get(text);
    if (cached !== undefined) return cached;

    const fontPx = fontSizePx();
    // 探针不可用（如测试环境拿不到布局宽度）时退化为按字符数估算，保证容量逻辑始终有值。
    const width = fontPx > 0 ? readWidth(text) / fontPx : text.length;
    cache.set(text, width);
    return width;
  }

  function invalidate() {
    cache.clear();
  }

  return { measureEm, fontSizePx, invalidate };
}

/**
 * 已输入文本的测量宽度，单位 em。
 * 按小写测量，保留"大小写作答都算数"的旧行为（判定比较本身也是小写归一的）。
 */
export function getInputWordWidthEm(text: string, measureEm: (text: string) => number) {
  return measureEm(text.toLocaleLowerCase());
}

/**
 * 输入块宽度，单位 em。
 *
 * 取目标单词与实际显示文字的较大者再加安全余量：
 * 正常输入时恒等于目标单词宽度 —— 下划线是固定长度提示，不随输入生长；
 * 仅当显示文字更宽（如目标是小写、实际敲了大写）时才撑开，避免文字被挤出块外换行。
 */
export function getWordBlockWidthEm(targetWidthEm: number, displayedWidthEm: number) {
  return Math.max(targetWidthEm, displayedWidthEm) + SUBPIXEL_SAFETY_EM;
}

/** 可输入容量：不超过目标单词实测宽度；容器更窄时不超过容器宽度，单位 em */
export function getWordCapacityEm(wordWidthEm: number, containerWidthEm: number) {
  return Math.max(0, Math.min(wordWidthEm, containerWidthEm));
}

/**
 * 词块宽度测量：输入区与答案区共用，保证答题前后每块宽度/换行点逐像素一致。
 *
 * 探针放在行容器内继承同一套字体：挂载后与字体加载完成后重测；
 * ResizeObserver 监听行容器 —— 题目字号自适应会改变字形步进取整，
 * 旧字号测的 em 比值在新字号下会偏窄约 0.8%（文字被挤出块外折行），
 * 因此字号变化（必然改变容器高度）后在新字号下失效重测，rAF 合并同帧通知。
 */
export function useWordWidths(rowEl: Ref<HTMLElement | undefined>) {
  const probeEl = ref<HTMLElement>();
  const version = ref(0);

  function readWidth(text: string) {
    const probe = probeEl.value;
    if (!probe) return 0;

    probe.textContent = text;
    return probe.getBoundingClientRect().width;
  }

  function readFontSize() {
    const probe = probeEl.value;
    if (!probe) return 0;

    return Number.parseFloat(window.getComputedStyle(probe).fontSize);
  }

  const measurer = createWordWidthMeasurer(readWidth, readFontSize);

  function invalidate() {
    measurer.invalidate();
    version.value += 1;
  }

  function measureEm(text: string) {
    // 读取版本号：失效重测后让依赖渲染更新
    void version.value;
    return measurer.measureEm(text);
  }

  /** 词块宽度：与输入态固定提示同一公式（目标单词实测 + 亚像素安全余量） */
  function wordWidth(word: string) {
    return getWordBlockWidthEm(measureEm(word), measureEm(""));
  }

  let observer: ResizeObserver | undefined;
  let frame: number | undefined;

  onMounted(() => {
    // 首次渲染时探针 ref 还未挂载，缓存里是退化的按字符数估算，挂载后按真实字体重测
    invalidate();

    // 字体加载完成后按最终字体重新测量
    document.fonts?.ready?.then(invalidate).catch(() => undefined);

    const row = rowEl.value;
    if (row && typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(() => {
        if (frame !== undefined) return;
        frame = window.requestAnimationFrame(() => {
          frame = undefined;
          invalidate();
        });
      });
      observer.observe(row);
    }
  });

  onUnmounted(() => {
    observer?.disconnect();
    if (frame !== undefined) {
      window.cancelAnimationFrame(frame);
      frame = undefined;
    }
  });

  return { probeEl, measureEm, fontSizePx: measurer.fontSizePx, invalidate, wordWidth };
}
