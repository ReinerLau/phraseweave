import { http } from "./http";

export interface UserRecentExerciseResponse {
  id: number;
  coursePackId: string;
  courseId: string;
  title: string;
  description: string;
  cover: string;
}

export async function fetchUserRecentCoursePacks() {
  return await http.get<UserRecentExerciseResponse[], UserRecentExerciseResponse[]>(
    `/user-course-progress/recent-course-packs`,
  );
}
