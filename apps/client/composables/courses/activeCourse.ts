import { ref } from "vue";

import {
  getLocalStorageItem,
  removeLocalStorageItem,
  setLocalStorageItem,
} from "~/utils/storageScope";

export const ACTIVE_COURSE_MAP = "activeCourseMap";

export function useActiveCourseMap() {
  const activeCourseMap = ref(getActiveCourseMap());

  function getActiveCourseMap() {
    return JSON.parse(getLocalStorageItem(ACTIVE_COURSE_MAP) || "{}");
  }

  function updateActiveCourseMap(coursePackId: string, courseId: string) {
    activeCourseMap.value = getActiveCourseMap();
    activeCourseMap.value[coursePackId] = courseId;
    setLocalStorageItem(ACTIVE_COURSE_MAP, JSON.stringify(activeCourseMap.value));
  }

  function removeActiveCourseMap(coursePackId: string) {
    activeCourseMap.value = getActiveCourseMap();
    delete activeCourseMap.value[coursePackId];
    setLocalStorageItem(ACTIVE_COURSE_MAP, JSON.stringify(activeCourseMap.value));
  }

  function resetActiveCourseMap() {
    removeLocalStorageItem(ACTIVE_COURSE_MAP);
  }

  return {
    activeCourseMap,
    resetActiveCourseMap,
    updateActiveCourseMap,
    removeActiveCourseMap,
  };
}
