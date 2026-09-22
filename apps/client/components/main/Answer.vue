<template>
  <div class="min-w-0 max-w-full text-center">
    <div
      class="flex w-full min-w-0 max-w-full flex-wrap items-center justify-center gap-1 text-5xl"
    >
      <span
        v-for="word in words"
        :key="word"
        class="max-w-full cursor-pointer break-words p-1 hover:text-fuchsia-500"
        @click="handlePlayWordSound(word)"
        >{{ word }}</span
      >
    </div>
    <div class="my-6 text-xl text-gray-500">
      {{ courseStore.currentStatement?.soundmark }}
    </div>
    <div class="my-6 text-xl text-gray-500">
      {{ courseStore.currentStatement?.chinese }}
    </div>
    <button
      class="btn btn-outline btn-sm"
      @click="goToNextQuestion"
    >
      下一题
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted } from "vue";

import { useCurrentStatementEnglishSound } from "~/composables/main/englishSound";
import { usePlayWordSound } from "~/composables/main/englishSound/audio";
import { useGameMode } from "~/composables/main/game";
import { useSummary } from "~/composables/main/summary";
import { useAutoPronunciation } from "~/composables/user/sound";
import { useExerciseStore } from "~/store/exercise";
import { cancelShortcut, registerShortcut } from "~/utils/keyboardShortcuts";

const courseStore = useExerciseStore();
const { handlePlayWordSound } = usePlayWordSound();
usePlayEnglishSound();
const { showSummary } = useSummary();
const { showQuestion } = useGameMode();
const { isAutoPlaySound } = useAutoPronunciation();

const words = computed(() => courseStore.currentStatement?.english.split(" "));

registerShortcutKeyForNextQuestion();

function usePlayEnglishSound() {
  const { playSound } = useCurrentStatementEnglishSound();

  onMounted(() => {
    if (isAutoPlaySound()) {
      playSound();
    }
  });
}

function registerShortcutKeyForNextQuestion() {
  function handleKeydown(e: KeyboardEvent) {
    e.preventDefault(); // 阻止到下一个页面的默认按键动作
    goToNextQuestion();
  }
  onMounted(() => {
    registerShortcut(" ", handleKeydown);
    registerShortcut("enter", handleKeydown);
  });

  onUnmounted(() => {
    cancelShortcut(" ", handleKeydown);
    cancelShortcut("enter", handleKeydown);
  });
}

function goToNextQuestion() {
  if (courseStore.isAllDone()) {
    showSummary();
    return;
  }

  courseStore.toNextStatement();
  showQuestion();
}
</script>
