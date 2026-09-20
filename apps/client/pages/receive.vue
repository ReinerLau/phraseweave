<template>
  <section class="mx-auto flex w-full max-w-lg flex-col py-10">
    <div class="mb-8 flex items-center justify-between">
      <div>
        <p class="text-sm opacity-60">PhraseWeave 本地练习</p>
        <h1 class="text-2xl font-bold">接收练习</h1>
      </div>
      <NuxtLink
        class="btn btn-ghost btn-sm"
        to="/course-pack"
        >返回练习列表</NuxtLink
      >
    </div>

    <div class="text-center">
      <p class="mt-4 text-slate-500">{{ message }}</p>

      <progress
        v-if="progress > 0 && progress < 100"
        class="progress progress-primary mt-8 w-full"
        :value="progress"
        max="100"
      ></progress>
      <p
        v-if="progress > 0"
        class="mt-2 text-sm text-slate-500"
      >
        {{ progress }}%
      </p>

      <button
        v-if="status === 'error'"
        class="btn mt-8"
        type="button"
        @click="goBack"
      >
        返回练习列表
      </button>
    </div>
  </section>
</template>

<script setup lang="ts">
import { navigateTo, useRoute } from "#imports";
import { onMounted, onUnmounted, ref } from "vue";

import type { SyncStatus } from "~/services/exerciseSync";
import { createReceiverSession, isValidRoomToken } from "~/services/exerciseSync";
import { saveLocalExercise } from "~/services/localExerciseDb";

const route = useRoute();
const room = String(route.query.room || "");
const status = ref<SyncStatus | "idle">("idle");
const message = ref("正在连接电脑…");
const progress = ref(0);
let session: { close: () => void } | undefined;

onMounted(async () => {
  if (!isValidRoomToken(room)) {
    update({ status: "error", message: "无效的练习同步二维码" });
    return;
  }

  try {
    session = await createReceiverSession(room, update, async (coursePack) => {
      await saveLocalExercise(coursePack);
    });
  } catch (error) {
    update({
      status: "error",
      message: error instanceof Error ? error.message : "无法接收练习",
    });
  }
});

function update(next: { status: SyncStatus; progress?: number; message?: string }) {
  status.value = next.status;
  if (next.progress !== undefined) progress.value = next.progress;
  if (next.message) message.value = next.message;
}

function goBack() {
  void navigateTo("/course-pack");
}

onUnmounted(() => session?.close());
</script>
