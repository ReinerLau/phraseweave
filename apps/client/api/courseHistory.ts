import type { ExerciseCatalogItem } from "~/store/exerciseCatalog";
import { http } from "./http";

export interface CourseHistoryResponse {
  courseId: string;
  completionCount: number;
}

export async function fetchCourseHistory(coursePackId: ExerciseCatalogItem["id"]) {
  return await http.get<CourseHistoryResponse[], CourseHistoryResponse[]>(
    `/course-history/${coursePackId}`,
  );
}
