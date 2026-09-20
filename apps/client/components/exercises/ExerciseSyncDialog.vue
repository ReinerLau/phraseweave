<template>
  <div
    class="modal modal-open"
    role="dialog"
    aria-modal="true"
    aria-labelledby="exercise-sync-title"
  >
    <div class="modal-box max-w-md">
      <div class="flex items-start justify-between gap-4">
        <div>
          <p class="text-sm opacity-60">PhraseWeave 本地练习</p>
          <h2
            id="exercise-sync-title"
            class="text-xl font-bold"
          >
            同步练习到手机
          </h2>
          <p class="mt-1 text-sm text-slate-500">{{ title }}</p>
        </div>
        <button
          class="btn btn-ghost btn-sm"
          type="button"
          aria-label="关闭同步弹窗"
          @click="close"
        >
          ×
        </button>
      </div>

      <div class="mt-6 text-center">
        <div
          v-if="qrDataUrl"
          class="flex flex-col items-center"
        >
          <img
            class="h-64 w-64 rounded-lg bg-white p-3"
            :src="qrDataUrl"
            alt="练习同步二维码"
          />
          <p class="mt-4 text-sm text-slate-500">{{ message }}</p>
          <progress
            v-if="progress > 0 && progress < 100"
            class="progress progress-primary mt-4 w-full"
            :value="progress"
            max="100"
          ></progress>

          <div class="mt-5 w-full text-left">
            <label
              class="text-sm font-semibold"
              for="exercise-sync-link"
              >手机浏览器打开同步链接</label
            >
            <div class="join mt-2 w-full">
              <input
                id="exercise-sync-link"
                class="input join-item input-bordered min-w-0 flex-1 text-sm"
                :value="syncUrl"
                type="url"
                readonly
                aria-label="练习同步链接"
              />
              <button
                class="btn join-item"
                type="button"
                :disabled="!syncUrl"
                @click="copySyncUrl"
              >
                复制
              </button>
            </div>
            <p
              v-if="copyMessage"
              class="mt-2 text-sm text-slate-500"
              aria-live="polite"
            >
              {{ copyMessage }}
            </p>
          </div>
        </div>
        <p
          v-else
          class="text-sm text-slate-500"
        >
          {{ message }}
        </p>
      </div>

      <div class="modal-action">
        <button
          v-if="errorMessage"
          class="btn btn-primary"
          type="button"
          @click="start"
        >
          重新生成
        </button>
        <button
          class="btn"
          type="button"
          @click="close"
        >
          关闭
        </button>
      </div>
    </div>
    <button
      class="modal-backdrop"
      type="button"
      aria-label="关闭同步弹窗"
      @click="close"
    ></button>
  </div>
</template>

<script setup lang="ts">
import QRCode from "qrcode";
import { onMounted, onUnmounted, ref } from "vue";

import type { ExerciseResponse } from "~/api/exercise";
import type { SyncStatus } from "~/services/exerciseSync";
import {
  createExerciseSyncUrl,
  createRoomToken,
  createSenderSession,
} from "~/services/exerciseSync";
import { getLocalExercise } from "~/services/localExerciseDb";

interface Props {
  exerciseId: string;
  title: string;
}

const props = defineProps<Props>();
const emit = defineEmits<{ close: [] }>();
const exercise = ref<ExerciseResponse>();
const qrDataUrl = ref("");
const syncUrl = ref("");
const copyMessage = ref("");
const message = ref("正在准备同步链接…");
const errorMessage = ref("");
const progress = ref(0);
const isSending = ref(false);
let session: { close: () => void } | undefined;
let disposed = false;

onMounted(() => {
  void start();
});

async function start() {
  session?.close();
  session = undefined;
  qrDataUrl.value = "";
  syncUrl.value = "";
  copyMessage.value = "";
  errorMessage.value = "";
  progress.value = 0;
  isSending.value = false;
  message.value = "正在准备同步链接…";

  try {
    exercise.value = await getLocalExercise(props.exerciseId);
    if (!exercise.value) throw new Error("本地找不到该练习");

    const roomToken = createRoomToken();
    syncUrl.value = createExerciseSyncUrl(roomToken);
    qrDataUrl.value = await QRCode.toDataURL(syncUrl.value, {
      width: 360,
      margin: 2,
      errorCorrectionLevel: "M",
    });
    if (disposed) return;

    isSending.value = true;
    message.value = "等待手机扫描并连接…";
    session = await createSenderSession(roomToken, exercise.value, update);
    if (disposed) session.close();
  } catch (error) {
    isSending.value = false;
    qrDataUrl.value = "";
    syncUrl.value = "";
    errorMessage.value = error instanceof Error ? error.message : "无法启动练习同步";
    message.value = errorMessage.value;
  }
}

function update(next: { status: SyncStatus; progress?: number; message?: string }) {
  if (next.progress !== undefined) progress.value = next.progress;
  if (next.message) message.value = next.message;
  if (next.status === "completed" || next.status === "error") {
    isSending.value = false;
    if (next.status === "error") errorMessage.value = next.message || "练习同步失败";
  }
}

async function copySyncUrl() {
  if (!syncUrl.value) return;

  try {
    await navigator.clipboard.writeText(syncUrl.value);
    copyMessage.value = "已复制同步链接";
  } catch {
    copyMessage.value = "复制失败，请手动选择链接复制";
  }
}

function close() {
  session?.close();
  emit("close");
}

onUnmounted(() => {
  disposed = true;
  session?.close();
});
</script>
