<template>
  <div
    class="card h-full w-full cursor-pointer bg-base-100 shadow-xl"
    @click="handleGoToExercise"
  >
    <div class="card-body">
      <div class="flex items-start justify-between gap-2">
        <h2 class="card-title">{{ exercise.title }}</h2>
        <div
          ref="actionsMenu"
          class="dropdown dropdown-end shrink-0"
          :class="{ 'dropdown-open': showActions }"
          @click.stop
        >
          <button
            class="btn btn-ghost btn-sm"
            type="button"
            aria-label="更多操作"
            title="更多操作"
            :aria-expanded="showActions"
            aria-haspopup="menu"
            @click="showActions = !showActions"
          >
            <span
              class="i-ph-dots-three-vertical h-5 w-5"
              aria-hidden="true"
            ></span>
          </button>
          <ul
            v-if="showActions"
            class="menu dropdown-content z-[1] mt-2 w-32 rounded-box bg-base-100 p-2 shadow"
            role="menu"
          >
            <li>
              <button
                type="button"
                aria-label="同步"
                title="同步"
                role="menuitem"
                @click="handleSync"
              >
                <span
                  class="i-ph-arrows-clockwise h-4 w-4"
                  aria-hidden="true"
                ></span>
                同步
              </button>
            </li>
            <li>
              <button
                class="text-error"
                type="button"
                aria-label="删除"
                title="删除"
                role="menuitem"
                @click="handleDelete"
              >
                <span
                  class="i-ph-trash h-4 w-4"
                  aria-hidden="true"
                ></span>
                删除
              </button>
            </li>
          </ul>
        </div>
      </div>
      <p>{{ exercise.description }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onClickOutside } from "@vueuse/core";
import { navigateTo } from "#imports";
import { ref } from "vue";

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
const actionsMenu = ref<HTMLElement>();
const showActions = ref(false);

onClickOutside(actionsMenu, () => {
  showActions.value = false;
});

function handleSync() {
  showActions.value = false;
  emit("sync", exercise);
}

function handleDelete() {
  showActions.value = false;
  emit("delete", exercise);
}

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
