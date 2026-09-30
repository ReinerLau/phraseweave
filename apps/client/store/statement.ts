import type { Ref } from "vue";

import { ref } from "vue";

import type { Course } from "./exercise";

const statementIndex = ref(0);

export function useStatement() {
  function setupStatement(course: Ref<Course | undefined>) {
    statementIndex.value = course.value!.statementIndex || 0;
  }

  return {
    setupStatement,
    statementIndex,
  };
}
