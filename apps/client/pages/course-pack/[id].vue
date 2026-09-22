<template>
  <div class="flex min-h-0 w-full flex-col overflow-hidden pt-2">
    <template v-if="isLoading">
      <Loading></Loading>
    </template>

    <template v-else>
      <div class="mb-4 flex items-center">
        <CommonBackLink
          label="返回练习清单"
          to="/course-pack"
        />
      </div>
      <h2 class="mb-4 border-b py-4 text-center text-3xl dark:border-gray-600">
        {{ exerciseCatalogStore.currentExercise?.title }}
      </h2>
      <div class="min-h-0 flex-1 overflow-hidden">
        <div
          class="grid h-full min-h-0 grid-cols-1 content-start justify-start gap-8 overflow-y-auto overflow-x-hidden pb-[calc(1.5rem+env(safe-area-inset-bottom))] pl-0 pr-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
        >
          <template
            v-for="course in exerciseCatalogStore.currentExercise?.courses"
            :key="course.id"
          >
            <CoursesCourseCard
              :title="course.title"
              :id="course.id"
              :count="course.completionCount"
              :coursePackId="course.coursePackId"
              @click="handleChangeCourse(course.id)"
            />
          </template>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { navigateTo } from "#app";
import { ref } from "vue";
import { useRoute } from "vue-router";

import { useActiveCourseMap } from "~/composables/courses/activeCourse";
import { useExerciseCatalogStore } from "~/store/exerciseCatalog";

const isLoading = ref(false);
const route = useRoute();
const exerciseCatalogStore = useExerciseCatalogStore();
const coursePackId = route.params.id as string;
const { updateActiveCourseMap } = useActiveCourseMap();

setup();

async function setup() {
  // 只在初始化的时候拉取一次数据
  // 后续只更新练习卡片的完成次数数据
  if (!exerciseCatalogStore.currentExercise) {
    isLoading.value = true;
    await exerciseCatalogStore.setupExercise(coursePackId);
    isLoading.value = false;
  }
}

function handleChangeCourse(courseId: string) {
  updateActiveCourseMap(coursePackId, courseId);
  navigateTo(`/game/${coursePackId}/${courseId}`);
}
</script>

<style></style>
