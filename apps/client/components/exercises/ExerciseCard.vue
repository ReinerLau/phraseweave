<template>
  <div
    class="card w-72 shrink-0 cursor-pointer bg-base-100 shadow-xl"
    @click="handleGoToExercise"
  >
    <div class="card-body">
      <div class="flex items-start justify-between gap-2">
        <h2 class="card-title">{{ exercise.title }}</h2>
        <div class="flex gap-1">
          <button
            class="btn btn-ghost btn-xs"
            type="button"
            @click.stop="emit('sync', exercise)"
          >
            同步
          </button>
          <button
            class="btn btn-ghost btn-xs text-error"
            type="button"
            @click.stop="emit('delete', exercise)"
          >
            删除
          </button>
        </div>
      </div>
      <p>{{ exercise.description }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { navigateTo } from "#imports";

import type { ExercisesResponse } from "~/api/exercise";
import { useActiveCourseMap } from "~/composables/courses/activeCourse";
import { getLocalExercise } from "~/services/localExerciseDb";

type Exercise = ExercisesResponse[number];
interface Props {
  exercise: Exercise;
}

const { exercise } = defineProps<Props>();
const emit = defineEmits<{
  delete: [exercise: Exercise];
  sync: [exercise: Exercise];
}>();
const { updateActiveCourseMap } = useActiveCourseMap();

async function handleGoToExercise() {
  if (exercise.isFree) {
    const localExercise = await getLocalExercise(exercise.id);
    const course = localExercise?.courses[0];

    if (!course) {
      await navigateTo(`/course-pack/${exercise.id}`);
      return;
    }

    updateActiveCourseMap(exercise.id, course.id);
    await navigateTo(`/game/${exercise.id}/${course.id}`);
  } else {
    // 看看是不是会员 不是的话 直接弹出消息告知 需要是会员
    // TODO 还没有检测是不是会员的功能函数
    console.log("需要是会员");
  }
}
</script>
