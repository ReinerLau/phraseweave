import { ref } from "vue";

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

/** 可输入容量：不超过目标单词实测宽度；容器更窄时不超过容器宽度，单位 em */
export function getWordCapacityEm(wordWidthEm: number, containerWidthEm: number) {
  return Math.max(0, Math.min(wordWidthEm, containerWidthEm));
}
