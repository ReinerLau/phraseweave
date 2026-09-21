<template>
  <div class="flex w-full min-w-0 flex-col overflow-x-hidden pt-2">
    <template v-if="isLoading">
      <Loading></Loading>
    </template>
    <template v-else>
      <div class="mb-4 flex items-center">
        <CommonBackLink
          to="/course-pack"
          label="返回练习清单"
        />
      </div>
      <MainTool />
      <MainGame />
    </template>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useRoute } from "vue-router";

import { useGameMode } from "~/composables/main/game";
import { useExerciseStore } from "~/store/exercise";

const isLoading = ref(true);
const route = useRoute();
const coursesStore = useExerciseStore();
const { showQuestion } = useGameMode();

showQuestion();

onMounted(async () => {
  const { coursePackId, id } = route.params;
  await coursesStore.setup(coursePackId as string, id as string);

  isLoading.value = false;
});
</script>
