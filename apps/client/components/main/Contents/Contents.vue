<template>
  <div
    id="contents"
    class="absolute right-0 top-20 z-20 w-80 max-w-full select-none overflow-x-hidden border-r-4 border-fuchsia-500 bg-white shadow dark:bg-slate-800"
    :class="[isShowContents() && 'show']"
    v-bind="containerProps"
  >
    <div
      class="px-2"
      v-bind="wrapperProps"
    >
      <div
        v-for="item in list"
        :key="item.data.id"
        :class="getItemClassNames(item.index)"
        @click="jumpTo(item.index)"
      >
        <div class="flex h-[60px] items-center border-b py-1 dark:border-slate-600">
          <div class="w-12 text-center">{{ item.index + 1 }}</div>
          <div class="min-w-0 flex-1 text-left">
            <div class="truncate">
              {{
                coursesStore.isStatementPassed(item.data) &&
                (!coursesStore.isFulltext || item.index < coursesStore.questionIndex)
                  ? item.data.english
                  : "____"
              }}
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useVirtualList } from "@vueuse/core";
import { computed, nextTick, onMounted, watch } from "vue";

import { useGameMode } from "~/composables/main/game";
import { useExerciseStore } from "~/store/exercise";
import { useContent } from "./useContents";

const coursesStore = useExerciseStore();
const { showQuestion } = useGameMode();
const { hideContents, isShowContents, watchClickOutside } = useContent();

const contentsList = computed(() => coursesStore.baseStatements);

const { list, containerProps, wrapperProps, scrollTo } = useVirtualList(contentsList, {
  itemHeight: 60,
});

onMounted(async () => {
  scrollTo(Math.max(0, coursesStore.questionIndex));
  watchClickOutside(containerProps.ref.value as HTMLElement);
});

watch(
  () => [coursesStore.questionIndex, coursesStore.learningMode, coursesStore.practiceView],
  async () => {
    await nextTick();
    scrollTo(Math.max(0, coursesStore.questionIndex));
  },
);

function isActive(index: number) {
  return coursesStore.questionIndex === index;
}

function getItemClassNames(index: number) {
  const classNames: string[] = [];
  if (isActive(index)) {
    classNames.push("text-fuchsia-500");
  }
  if (!coursesStore.isFulltext) classNames.push("hover:text-fuchsia-500 cursor-pointer");
  return classNames;
}

function jumpTo(index: number) {
  if (coursesStore.isFulltext) return;
  hideContents();
  showQuestion();
  coursesStore.toSpecificStatement(index);
}
</script>

<style scoped>
#contents {
  height: 0rem;
  opacity: 0;
  transition: all 0.5s;
}

#contents::-webkit-scrollbar {
  display: none;
}

#container::-webkit-scrollbar {
  display: none;
}

#contents.show {
  opacity: 1;
  /* 刚好显示 12 个题目 */
  height: 24.6rem;
}
</style>
