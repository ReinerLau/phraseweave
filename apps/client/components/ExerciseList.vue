<template>
  <div class="flex min-h-0 w-full flex-col overflow-hidden pt-2">
    <div class="my-10 flex shrink-0 flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <h2 class="text-2xl font-bold">练习清单</h2>
      <div
        v-if="!isManaging"
        class="flex flex-wrap gap-2"
      >
        <button
          v-if="!isLoading && exerciseCatalogStore.exercises.length > 0"
          class="btn btn-sm"
          type="button"
          @click="isManaging = true"
        >
          批量管理
        </button>
        <NuxtLink
          class="btn btn-sm"
          to="/generator"
        >
          生成练习
        </NuxtLink>
        <button
          class="btn btn-sm"
          type="button"
          @click="openImport"
        >
          添加练习
        </button>
      </div>
    </div>
    <div
      v-if="isManaging"
      class="mb-4 flex shrink-0 flex-wrap items-center gap-3"
      aria-label="批量管理"
    >
      <label class="flex cursor-pointer items-center gap-2">
        <input
          class="checkbox-primary checkbox"
          type="checkbox"
          :checked="allSelected"
          :indeterminate="selectedIds.length > 0 && !allSelected"
          :disabled="isDeleting"
          @change="toggleSelectAll"
        />
        全选
      </label>
      <span role="status">已选 {{ selectedIds.length }} 项</span>
      <button
        class="btn btn-error btn-sm"
        type="button"
        :disabled="isDeleting || selectedIds.length === 0"
        @click="deleteSelectedExercises"
      >
        {{ isDeleting ? "删除中…" : "删除" }}
      </button>
      <button
        class="btn btn-sm"
        type="button"
        :disabled="isDeleting"
        @click="exitManagement"
      >
        取消
      </button>
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
      <div class="min-h-0 flex-1 overflow-y-auto pb-6">
        <p
          v-if="exerciseCatalogStore.exercises.length === 0"
          class="py-10 text-center"
        >
          暂无练习
        </p>
        <div
          v-else
          class="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4"
        >
          <template
            v-for="exercise in exerciseCatalogStore.exercises"
            :key="exercise.id"
          >
            <ExerciseCard
              :exercise="exercise"
              :selection-mode="isManaging"
              :selected="selectedIdSet.has(exercise.id)"
              :disabled="isDeleting"
              @delete="deleteExercise"
              @select="toggleSelection"
            />
          </template>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";

import ExerciseCard from "~/components/exercises/ExerciseCard.vue";
import { importLocalExercises } from "~/services/localExerciseDb";
import { useExerciseCatalogStore } from "~/store/exerciseCatalog";

const exerciseCatalogStore = useExerciseCatalogStore();
const isLoading = ref(false);
const importInput = ref<HTMLInputElement>();
const isManaging = ref(false);
const isDeleting = ref(false);
const selection = ref<string[]>([]);
const selectedIds = computed(() => {
  const ids = new Set(selection.value);
  return exerciseCatalogStore.exercises
    .filter((exercise) => ids.has(exercise.id))
    .map((exercise) => exercise.id);
});
const selectedIdSet = computed(() => new Set(selectedIds.value));
const allSelected = computed(
  () =>
    exerciseCatalogStore.exercises.length > 0 &&
    selectedIds.value.length === exerciseCatalogStore.exercises.length,
);

setup();

async function setup() {
  // 练习清单不会自动更新，所以初始化时只读取一次本地数据。
  if (exerciseCatalogStore.exercises.length === 0) {
    isLoading.value = true;
    await exerciseCatalogStore.setupExercises();
    isLoading.value = false;
  }
}

function openImport() {
  importInput.value?.click();
}

function toggleSelection(id: string) {
  if (isDeleting.value) return;
  selection.value = selectedIdSet.value.has(id)
    ? selectedIds.value.filter((selectedId) => selectedId !== id)
    : [...selectedIds.value, id];
}

function toggleSelectAll() {
  if (isDeleting.value) return;
  selection.value = allSelected.value
    ? []
    : exerciseCatalogStore.exercises.map((exercise) => exercise.id);
}

function exitManagement() {
  if (isDeleting.value) return;
  isManaging.value = false;
  selection.value = [];
}

async function deleteSelectedExercises() {
  if (isDeleting.value || selectedIds.value.length === 0) return;
  const ids = [...selectedIds.value];
  if (
    !window.confirm(
      `确定删除选中的 ${ids.length} 个练习吗？练习内容和学习进度将一并删除，此操作无法撤销。`,
    )
  )
    return;

  isDeleting.value = true;
  try {
    const { deletedIds, failedIds } = await exerciseCatalogStore.removeExercises(ids);
    selection.value = failedIds;
    if (failedIds.length > 0) {
      window.alert(`已删除 ${deletedIds.length} 个练习，${failedIds.length} 个删除失败，请重试。`);
    } else {
      isManaging.value = false;
    }
  } catch (error) {
    window.alert(error instanceof Error ? error.message : "删除失败");
  } finally {
    isDeleting.value = false;
  }
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
