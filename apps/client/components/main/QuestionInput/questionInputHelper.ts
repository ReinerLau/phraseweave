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

/** 输入块每侧留白，单位 ch（当前字体中 "0" 的宽度） */
export const WORD_BLOCK_PADDING_CH = 0.25;

export interface WordWidthMeasurer {
  /** 测量文本在当前字体下的宽度，单位 ch */
  measureCh(text: string): number;
  /** 当前字体中 1ch 对应的像素宽度 */
  chWidthPx(): number;
  /** 字体变化（如字体加载完成）后清空缓存，下次测量重新读取探针 */
  invalidate(): void;
}

/**
 * 基于真实渲染测量文本宽度。
 *
 * readWidth 由组件注入：把文本写入隐藏探针元素后读取实际渲染宽度，
 * 因此测量结果与输入块里显示的字形完全一致，不再依赖字符宽度估算表。
 */
export function createWordWidthMeasurer(readWidth: (text: string) => number): WordWidthMeasurer {
  const cache = new Map<string, number>();

  function chWidthPx() {
    return readWidth("0");
  }

  function measureCh(text: string): number {
    const cached = cache.get(text);
    if (cached !== undefined) return cached;

    const zeroWidth = chWidthPx();
    // 探针不可用（如测试环境拿不到布局宽度）时退化为按字符数估算，保证容量逻辑始终有值。
    const width = zeroWidth > 0 ? readWidth(text) / zeroWidth : text.length;
    cache.set(text, width);
    return width;
  }

  function invalidate() {
    cache.clear();
  }

  return { measureCh, chWidthPx, invalidate };
}

/** 输入块宽度：目标单词实测宽度 + 左右留白，单位 ch */
export function getWordBlockWidthCh(word: string, measureCh: (text: string) => number) {
  return measureCh(word) + WORD_BLOCK_PADDING_CH * 2;
}

/**
 * 已输入文本的测量宽度，单位 ch。
 * 按小写测量，保留"大小写作答都算数"的旧行为（判定比较本身也是小写归一的）。
 */
export function getInputWordWidthCh(text: string, measureCh: (text: string) => number) {
  return measureCh(text.toLocaleLowerCase());
}

/** 可输入容量：不超过目标单词实测宽度；容器更窄时扣除留白，保证文字不会顶到容器边缘，单位 ch */
export function getWordCapacityCh(wordWidthCh: number, containerWidthCh: number) {
  return Math.max(0, Math.min(wordWidthCh, containerWidthCh - WORD_BLOCK_PADDING_CH * 2));
}
