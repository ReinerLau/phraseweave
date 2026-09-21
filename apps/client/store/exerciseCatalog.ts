import { defineStore } from "pinia";
import { ref } from "vue";

import type { ExerciseResponse, ExercisesResponse } from "~/api/exercise";
import {
  deleteLocalExercise,
  getLocalExercise,
  listLocalExercises,
} from "~/services/localExerciseDb";

export interface ExerciseCatalogItem {
  id: string;
  order: number;
  title: string;
  description: string;
  isFree: boolean;
}

export const useExerciseCatalogStore = defineStore("exercise-catalog", () => {
  const exercises = ref<ExercisesResponse>([]);
  const currentExercise = ref<ExerciseResponse>();

  async function setupExercises() {
    exercises.value = await listLocalExercises();
  }

  async function setupExercise(coursePackId: string) {
    const localPack = await getLocalExercise(coursePackId);
    if (!localPack) throw new Error("本地找不到该练习");
    currentExercise.value = localPack;
  }

  async function removeExercise(coursePackId: string) {
    await deleteLocalExercise(coursePackId);
    exercises.value = exercises.value.filter((exercise) => exercise.id !== coursePackId);
    if (currentExercise.value?.id === coursePackId) {
      currentExercise.value = undefined;
    }
  }

  async function updateExerciseCompleteCount(_coursePackId: string) {
    // Progress is stored with the local course pack; no remote history is needed.
  }

  return {
    setupExercise,
    setupExercises,
    removeExercise,
    updateExerciseCompleteCount,
    currentExercise,
    exercises,
  };
});
