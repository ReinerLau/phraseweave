<template>
  <div
    :class="[
      'w-full bg-white text-slate-600 transition-colors dark:bg-theme-dark dark:text-slate-300',
      isExerciseNavigationPage ? 'h-screen overflow-hidden' : 'min-h-screen',
    ]"
  >
    <div
      class="m-auto flex w-full flex-col items-center"
      :class="isExerciseNavigationPage ? 'h-full min-h-0 overflow-hidden' : 'min-h-screen'"
    >
      <EnvironmentBanner />
      <Navbar />
      <div
        class="flex w-full max-w-screen-xl flex-1 px-6"
        :class="isExerciseNavigationPage ? 'min-h-0 overflow-hidden' : ''"
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
</script>
