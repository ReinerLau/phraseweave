import { useLocalStorageBoolean } from "~/utils/localStorage";

export const SHOW_ERROR_TIP = "showErrorTip";

export function useErrorTip() {
  const {
    value: showErrorTip,
    toggle: toggleShowErrorTip,
    isTrue: isShowErrorTip,
    remove: removeShowErrorTip,
  } = useLocalStorageBoolean(SHOW_ERROR_TIP, false);

  return {
    showErrorTip,
    toggleShowErrorTip,
    isShowErrorTip,
    removeShowErrorTip,
  };
}
