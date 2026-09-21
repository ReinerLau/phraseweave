import { ref } from "vue";

import { getLocalStorageItem, setLocalStorageItem } from "~/utils/storageScope";

/**
 * 有道 Web 发音 API 接口
 *
 * 美式发音：https://dict.youdao.com/dictvoice?type=2&audio=word
 * 英式发音：https://dict.youdao.com/dictvoice?type=1&audio=word
 */

export enum PronunciationType {
  American = "American",
  British = "British",
}

// 临时关闭有道朗读；恢复功能时改为 true。
export const YOUDAO_PRONUNCIATION_ENABLED = false;

export const pronunciationLabels: { [key in PronunciationType]: string } = {
  [PronunciationType.American]: "美音",
  [PronunciationType.British]: "英音",
};

const PRONUNCIATION_TYPE = "pronunciationType";
const pronunciation = ref<PronunciationType>(PronunciationType.American); // 默认美音
export function usePronunciation() {
  loadCache();

  function loadCache() {
    const type = getStore() || pronunciation.value;
    setStore(type);
  }

  function setStore(value: PronunciationType) {
    pronunciation.value = value;
    setLocalStorageItem(PRONUNCIATION_TYPE, value);
  }

  function getStore(): PronunciationType {
    return getLocalStorageItem(PRONUNCIATION_TYPE) as PronunciationType;
  }

  function getPronunciationType(): number {
    return pronunciation.value === PronunciationType.American ? 2 : 1;
  }

  function getPronunciationOptions() {
    return Object.entries(pronunciationLabels).map(([key, value]) => {
      return {
        label: value,
        value: key,
      };
    });
  }

  function getPronunciationUrl(english: string | undefined): string {
    return `https://dict.youdao.com/dictvoice?type=${getPronunciationType()}&audio=${english}`;
  }

  // 切换发音
  function togglePronunciation(type: PronunciationType) {
    if (type !== pronunciation.value) setStore(type);
  }

  return {
    pronunciation,
    getPronunciationOptions,
    getPronunciationUrl,
    togglePronunciation,
  };
}
