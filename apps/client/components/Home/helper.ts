import { ref } from "vue";

import type { UserRecentExerciseResponse } from "~/api/userCourseProgress";
import { fetchUserRecentCoursePacks } from "~/api/userCourseProgress";

const coursePacks = ref<UserRecentExerciseResponse[]>([]);

export function useRecentCoursePack() {
  async function fetchExercises() {
    coursePacks.value = await fetchUserRecentCoursePacks();
  }

  return {
    fetchExercises,
    coursePacks,
  };
}
