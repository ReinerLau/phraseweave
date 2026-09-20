<template>
  <div class="flex w-full flex-col pt-2">
    <div class="my-10 flex items-center justify-between gap-4">
      <h2 class="text-2xl font-bold">多课程包</h2>
      <div class="flex gap-2">
        <NuxtLink
          class="btn btn-primary btn-sm"
          to="/scan"
          >扫描电脑</NuxtLink
        >
        <NuxtLink
          class="btn btn-sm"
          to="/transfer"
          >发送课程</NuxtLink
        >
        <button
          class="btn btn-sm"
          type="button"
          @click="exportBackup"
        >
          导出
        </button>
        <button
          class="btn btn-sm"
          type="button"
          @click="openImport"
        >
          导入
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
        <template v-for="coursePack in coursePackStore.coursePacks">
          <CoursePackCard :coursePack="coursePack"></CoursePackCard>
        </template>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";

import CoursePackCard from "~/components/courses/CoursePackCard.vue";
import { exportLocalCoursePacks, importLocalCoursePacks } from "~/services/localCourseDb";
import { useCoursePackStore } from "~/store/coursePack";

const coursePackStore = useCoursePackStore();
const isLoading = ref(false);
const importInput = ref<HTMLInputElement>();

setup();

async function setup() {
  // 课程包不会更新 所以初始化的时候只拉取一次数据就好了
  if (coursePackStore.coursePacks.length === 0) {
    isLoading.value = true;
    await coursePackStore.setupCoursePacks();
    isLoading.value = false;
  }
}

async function exportBackup() {
  const coursePacks = await exportLocalCoursePacks();
  if (coursePacks.length === 0) return;

  const blob = new Blob([JSON.stringify(coursePacks)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `phraseweave-courses-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

function openImport() {
  importInput.value?.click();
}

async function importBackup(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;

  try {
    const count = await importLocalCoursePacks(JSON.parse(await file.text()));
    await coursePackStore.setupCoursePacks();
    window.alert(`已导入 ${count} 个课程包`);
  } catch (error) {
    window.alert(error instanceof Error ? error.message : "导入失败");
  } finally {
    input.value = "";
  }
}
</script>

<style></style>
