import { ref } from "vue";

import { getLocalStorageItem, removeLocalStorageItem, setLocalStorageItem } from "./storageScope";

// 封装个通用 hook 来处理 localStorage boolean
export function useLocalStorageBoolean(
  key: string,
  // 默认开启
  defaultValue: boolean = true,
) {
  const valueRef = ref(defaultValue);

  function loadCache() {
    const storedValue = getLocalStorageItem(key);
    // 如果 localStorage 中有值才进行校验，则使用该值
    if (storedValue !== null) {
      valueRef.value = storedValue === "true";
    }
    update(valueRef.value);
  }

  function update(value: boolean) {
    valueRef.value = value;
    setLocalStorageItem(key, String(value));
  }

  function remove() {
    removeLocalStorageItem(key);
  }

  function toggle() {
    update(!valueRef.value);
  }

  function isTrue(): boolean {
    return valueRef.value;
  }

  loadCache();

  return {
    value: valueRef,
    remove,
    toggle,
    isTrue,
  };
}
