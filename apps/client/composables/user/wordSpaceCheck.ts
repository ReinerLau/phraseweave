import { useLocalStorageBoolean } from "~/utils/localStorage";

export const WORD_SPACE_CHECK = "wordSpaceCheck";

export function useWordSpaceCheck() {
  const {
    value: wordSpaceCheck,
    toggle: toggleWordSpaceCheck,
    isTrue: isWordSpaceCheckEnabled,
  } = useLocalStorageBoolean(WORD_SPACE_CHECK, false);

  return { wordSpaceCheck, toggleWordSpaceCheck, isWordSpaceCheckEnabled };
}
