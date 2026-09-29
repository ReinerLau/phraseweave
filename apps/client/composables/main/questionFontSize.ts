import { ref } from "vue";

import { QUESTION_FONT_MAX_SIZE_PX } from "~/components/mode/cloze/questionLayoutHelper";

const questionFontSize = ref(QUESTION_FONT_MAX_SIZE_PX);

export function useQuestionFontSize() {
  return {
    questionFontSize,
  };
}
