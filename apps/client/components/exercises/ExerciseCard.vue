<template>
  <div
    class="card h-full w-full cursor-pointer bg-base-100 shadow-xl"
    :class="{
      'ring-2 ring-inset ring-primary': selectionMode && selected,
      'cursor-wait': disabled,
    }"
    @click="handleGoToExercise"
  >
    <div class="card-body">
      <div class="flex items-start justify-between gap-2">
        <input
          v-if="selectionMode"
          class="checkbox-primary checkbox shrink-0"
          type="checkbox"
          :aria-label="`选择练习“${exercise.title}”`"
          :checked="selected"
          :disabled="disabled"
          @click.stop
          @change="handleSelect"
        />
        <h2 class="card-title line-clamp-2 min-w-0 flex-1 break-words">{{ exercise.title }}</h2>
        <div
          v-if="!selectionMode"
          ref="actionsMenu"
          class="dropdown dropdown-end shrink-0"
          :class="{ 'dropdown-open': showActions }"
          @click.stop
        >
          <button
            class="btn btn-ghost btn-sm h-8 min-h-8 w-8 min-w-8 rounded-md p-0"
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
      <p v-if="exercise.description">{{ exercise.description }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onClickOutside } from "@vueuse/core";
import { navigateTo } from "#imports";
import { ref, watch } from "vue";

import type { ExercisesResponse } from "~/api/exercise";
import { useActiveCourseMap } from "~/composables/courses/activeCourse";
import { getLocalExercise } from "~/services/localExerciseDb";

type Exercise = ExercisesResponse[number];
interface Props {
  exercise: Exercise;
  selectionMode?: boolean;
  selected?: boolean;
  disabled?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  selectionMode: false,
  selected: false,
  disabled: false,
});
const emit = defineEmits<{
  delete: [exercise: Exercise];
  select: [id: string];
}>();
const { updateActiveCourseMap } = useActiveCourseMap();
const actionsMenu = ref<HTMLElement>();
const showActions = ref(false);

onClickOutside(actionsMenu, () => {
  showActions.value = false;
});

watch(
  () => props.selectionMode,
  () => {
    showActions.value = false;
  },
);

function handleSelect() {
  if (!props.disabled) emit("select", props.exercise.id);
}

function handleDelete() {
  showActions.value = false;
  emit("delete", props.exercise);
}

async function handleGoToExercise() {
  if (props.disabled) return;
  if (props.selectionMode) {
    handleSelect();
    return;
  }

  const exercise = props.exercise;
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
