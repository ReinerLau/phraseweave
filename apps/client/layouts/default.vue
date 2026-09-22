<template>
  <div
    :class="[
      'w-full bg-white pb-[env(safe-area-inset-bottom)] text-slate-600 transition-colors dark:bg-theme-dark dark:text-slate-300',
      isExerciseNavigationPage ? 'app-dynamic-height overflow-hidden' : 'app-min-height',
    ]"
  >
    <div
      class="m-auto flex w-full flex-col items-center"
      :class="isExerciseNavigationPage ? 'h-full min-h-0 overflow-hidden' : 'app-min-height'"
    >
      <div
        class="flex w-full min-w-0 flex-1"
        :class="[
          isPracticePage ? 'max-w-none px-4' : 'max-w-screen-xl px-6',
          isExerciseNavigationPage ? 'min-h-0 overflow-hidden' : '',
        ]"
        :data-testid="isPracticePage ? 'practice-page-shell' : undefined"
      >
        <slot></slot>
      </div>
      <Footer></Footer>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useRoute } from "vue-router";

const route = useRoute();
const isExerciseNavigationPage = computed(
  () =>
    route.path === "/" || route.path === "/course-pack" || route.path.startsWith("/course-pack/"),
);
const isPracticePage = computed(() => route.path.startsWith("/game/"));
</script>
