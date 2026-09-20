import { http } from "./http";

interface UserProgressResponse {
  courseId: string;
}

interface UserProgressUpdate {
  coursePackId: string;
  courseId: string;
  statementIndex: number;
}

export interface UserRecentExerciseResponse {
  id: number;
  coursePackId: string;
  courseId: string;
  title: string;
  description: string;
  cover: string;
}

export async function fetchUpdateCourseProgress(userProgressUpdate: UserProgressUpdate) {
  return await http.put<UserProgressResponse, UserProgressResponse>(
    `user-course-progress`,
    userProgressUpdate,
  );
}

export async function fetchUserRecentCoursePacks() {
  return await http.get<UserRecentExerciseResponse[], UserRecentExerciseResponse[]>(
    `/user-course-progress/recent-course-packs`,
  );
}
