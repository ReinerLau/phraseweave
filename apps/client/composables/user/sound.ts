import { useLocalStorageBoolean } from "~/utils/localStorage";

export const KEYBOARD_SOUND_KEY = "keyboardSoundEnabled";

export function useKeyboardSound() {
  const {
    value: keyboardSound,
    isTrue: isKeyboardSoundEnabled,
    toggle: toggleKeyboardSound,
    remove: removeKeyboardSound,
  } = useLocalStorageBoolean(KEYBOARD_SOUND_KEY, true);

  return {
    keyboardSound,
    isKeyboardSoundEnabled,
    toggleKeyboardSound,
    removeKeyboardSound,
  };
}
