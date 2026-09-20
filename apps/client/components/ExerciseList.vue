<template>
  <div class="flex w-full flex-col pt-2">
    <div class="my-10 flex items-center justify-between gap-4">
      <h2 class="text-2xl font-bold">练习列表</h2>
      <div class="flex gap-2">
        <button
          class="btn btn-sm"
          type="button"
          @click="openImport"
        >
          添加练习
        </button>
      </div>
    </div>
    <input
      ref="importInput"
      class="hidden"
      type="file"
      accept="application/json"
      @change="importBackup"
    />
    <template v-if="isLoading">
      <Loading></Loading>
    </template>
    <template v-else>
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
        <template
          v-for="exercise in exerciseCatalogStore.exercises"
          :key="exercise.id"
        >
          <ExerciseCard
            :exercise="exercise"
            @delete="deleteExercise"
            @sync="openSync"
          />
        </template>
      </div>
    </template>

    <ExerciseSyncDialog
      v-if="selectedExercise"
      :exercise-id="selectedExercise.id"
      :title="selectedExercise.title"
      @close="selectedExercise = undefined"
    />
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";

import type { ExercisesResponse } from "~/api/exercise";
import ExerciseCard from "~/components/exercises/ExerciseCard.vue";
import ExerciseSyncDialog from "~/components/exercises/ExerciseSyncDialog.vue";
import { importLocalExercises } from "~/services/localExerciseDb";
import { useExerciseCatalogStore } from "~/store/exerciseCatalog";

const exerciseCatalogStore = useExerciseCatalogStore();
const isLoading = ref(false);
const importInput = ref<HTMLInputElement>();
const selectedExercise = ref<ExercisesResponse[number]>();

setup();

async function setup() {
  // 练习列表不会自动更新，所以初始化时只读取一次本地数据。
  if (exerciseCatalogStore.exercises.length === 0) {
    isLoading.value = true;
    await exerciseCatalogStore.setupExercises();
    isLoading.value = false;
  }
}

function openImport() {
  importInput.value?.click();
}

function openSync(exercise: ExercisesResponse[number]) {
  selectedExercise.value = exercise;
}

async function deleteExercise(exercise: { id: string; title: string }) {
  if (!window.confirm(`确定删除练习“${exercise.title}”吗？`)) return;

  try {
    await exerciseCatalogStore.removeExercise(exercise.id);
  } catch (error) {
    window.alert(error instanceof Error ? error.message : "删除失败");
  }
}

async function importBackup(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;

  try {
    const count = await importLocalExercises(JSON.parse(await file.text()));
    await exerciseCatalogStore.setupExercises();
    window.alert(`已导入 ${count} 个练习`);
  } catch (error) {
    window.alert(error instanceof Error ? error.message : "导入失败");
  } finally {
    input.value = "";
  }
}
</script>
