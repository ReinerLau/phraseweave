import { type Course } from "~/store/exercise";
import { http } from "./http";

export type ExercisesResponse = Array<{
  id: string;
  title: string;
  isFree: boolean;
  description: string;
  cover: string;
}>;

export interface ExerciseResponse {
  id: string;
  title: string;
  description: string;
  isFree: boolean;
  cover: string;
  courses: Array<Course>;
}

export async function fetchExercises() {
  return await http.get<ExercisesResponse, ExercisesResponse>("/course-pack");
}

export async function fetchExercise(coursePackId: string) {
  return await http.get<ExerciseResponse, ExerciseResponse>(`/course-pack/${coursePackId}`);
}
