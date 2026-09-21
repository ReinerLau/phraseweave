import { watchEffect } from "vue";

import type { PlayOptions } from "./audio";
import { usePronunciation, YOUDAO_PRONUNCIATION_ENABLED } from "~/composables/user/pronunciation";
import { useExerciseStore } from "~/store/exercise";
import { play, updateSource } from "./audio";

const { getPronunciationUrl } = usePronunciation();

let lastPronunciationUrl = "";
export function useCurrentStatementEnglishSound() {
  const courseStore = useExerciseStore();

  watchEffect(() => {
    if (!YOUDAO_PRONUNCIATION_ENABLED) return;

    const word = courseStore.currentStatement?.english;
    const pronunciationUrl = getPronunciationUrl(word);
    if (lastPronunciationUrl !== pronunciationUrl) {
      updateSource(pronunciationUrl);
    }
    lastPronunciationUrl = pronunciationUrl;
  });

  return {
    playSound: (options?: PlayOptions) => {
      if (!YOUDAO_PRONUNCIATION_ENABLED) return () => {};

      return play(options);
    },
  };
}

// 朗读每日一句
export function readOneSentencePerDayAloud(str: string) {
  if (!YOUDAO_PRONUNCIATION_ENABLED) return;

  const pronunciationUrl = getPronunciationUrl(str);
  updateSource(pronunciationUrl);
  play();
}
