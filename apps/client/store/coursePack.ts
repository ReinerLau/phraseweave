import { defineStore } from "pinia";
import { ref } from "vue";

import type { CoursePackResponse, CoursePacksResponse } from "~/api/coursePack";
import { fetchCourseHistory } from "~/api/courseHistory";
import { fetchCoursePack, fetchCoursePacks } from "~/api/coursePack";
import {
  getLocalCoursePack,
  listLocalCoursePacks,
  saveLocalCoursePack,
  saveLocalCoursePackCatalog,
} from "~/services/localCourseDb";

export interface CoursePack {
  id: string;
  order: number;
  title: string;
  description: string;
  isFree: boolean;
}

export const useCoursePackStore = defineStore("course-pack", () => {
  const coursePacks = ref<CoursePacksResponse>([]);
  const currentCoursePack = ref<CoursePackResponse>();

  async function setupCoursePacks() {
    const localPacks = await listLocalCoursePacks();
    if (localPacks.length > 0) {
      coursePacks.value = localPacks;
    }

    try {
      const res = await fetchCoursePacks();
      coursePacks.value = res;
      await saveLocalCoursePackCatalog(res);
    } catch (error) {
      if (coursePacks.value.length === 0) throw error;
    }
  }

  async function setupCoursePack(coursePackId: string) {
    const localPack = await getLocalCoursePack(coursePackId);
    if (localPack) {
      currentCoursePack.value = localPack;
      return;
    }

    const res = await fetchCoursePack(coursePackId);
    currentCoursePack.value = res;
    await saveLocalCoursePack(res);
  }

  async function updateCoursesCompleteCount(coursePackId: string) {
    const courseHistory = await fetchCourseHistory(coursePackId);

    const find = (courseId: string) =>
      courseHistory.find((history) => history.courseId === courseId);

    currentCoursePack.value?.courses.forEach((course) => {
      const matchCourseHistory = find(course.id);

      if (matchCourseHistory) {
        course.completionCount = matchCourseHistory.completionCount;
      }
    });
  }

  return {
    setupCoursePack,
    setupCoursePacks,
    updateCoursesCompleteCount,
    currentCoursePack,
    coursePacks,
  };
});
