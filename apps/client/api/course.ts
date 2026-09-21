import type { ExerciseCatalogItem } from "~/store/exerciseCatalog";
import { type Course } from "~/store/exercise";
import { http } from "./http";

export async function fetchCourse(coursePackId: ExerciseCatalogItem["id"], courseId: Course["id"]) {
  return await http.get<Course, Course>(`course-pack/${coursePackId}/courses/${courseId}`);
}

type CompleteCourseResponse = { nextCourse: Course | undefined };
export async function fetchCompleteCourse(
  coursePackId: ExerciseCatalogItem["id"],
  courseId: Course["id"],
) {
  return await http.post<CompleteCourseResponse, CompleteCourseResponse>(
    `/course-pack/${coursePackId}/courses/${courseId}/complete`,
  );
}
