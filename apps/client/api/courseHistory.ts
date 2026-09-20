import type { CoursePack } from "~/store/exerciseCatalog";
import { http } from "./http";

export interface CourseHistoryResponse {
  courseId: string;
  completionCount: number;
}

export async function fetchCourseHistory(coursePackId: CoursePack["id"]) {
  return await http.get<CourseHistoryResponse[], CourseHistoryResponse[]>(
    `/course-history/${coursePackId}`,
  );
}
