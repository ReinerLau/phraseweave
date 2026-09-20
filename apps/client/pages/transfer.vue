<template>
  <section class="mx-auto flex w-full max-w-lg flex-col py-10">
    <h1 class="text-2xl font-bold">发送课程到手机</h1>
    <p class="mt-2 text-sm text-slate-500">在手机 PWA 内点击“扫描电脑”，然后扫描下方二维码。</p>

    <label
      class="mt-8 text-sm font-semibold"
      for="course-pack"
      >选择课程包</label
    >
    <select
      id="course-pack"
      v-model="selectedId"
      class="select select-bordered mt-2 w-full"
    >
      <option
        value=""
        disabled
      >
        请选择课程包
      </option>
      <option
        v-for="coursePack in coursePackStore.coursePacks"
        :key="coursePack.id"
        :value="coursePack.id"
      >
        {{ coursePack.title }}
      </option>
    </select>

    <div
      v-if="qrDataUrl"
      class="mt-8 flex flex-col items-center"
    >
      <img
        class="h-72 w-72 rounded-lg bg-white p-3"
        :src="qrDataUrl"
        alt="课程传输二维码"
      />
      <p class="mt-4 text-center text-sm text-slate-500">{{ message }}</p>
      <progress
        v-if="progress > 0"
        class="progress progress-primary mt-4 w-full"
        :value="progress"
        max="100"
      ></progress>

      <div class="mt-6 w-full">
        <label
          class="text-left text-sm font-semibold"
          for="transfer-link"
          >电脑端复制同步链接</label
        >
        <div class="join mt-2 w-full">
          <input
            id="transfer-link"
            class="input join-item input-bordered min-w-0 flex-1 text-sm"
            :value="receiveUrl"
            type="url"
            readonly
            aria-label="课程同步链接"
          />
          <button
            class="btn join-item"
            type="button"
            :disabled="!receiveUrl"
            @click="copyReceiveUrl"
          >
            复制链接
          </button>
        </div>
        <p
          v-if="copyMessage"
          class="mt-2 text-left text-sm text-slate-500"
          aria-live="polite"
        >
          {{ copyMessage }}
        </p>
      </div>
    </div>
    <p
      v-else-if="message"
      class="mt-4 text-sm text-slate-500"
    >
      {{ message }}
    </p>

    <div class="mt-8 flex gap-3">
      <button
        class="btn btn-primary flex-1"
        type="button"
        :disabled="!selectedId || isSending"
        @click="start"
      >
        {{ isSending ? "等待手机连接…" : "生成二维码" }}
      </button>
      <button
        class="btn"
        type="button"
        @click="goBack"
      >
        返回课程包列表
      </button>
    </div>
  </section>
</template>

<script setup lang="ts">
import QRCode from "qrcode";
import { onMounted, onUnmounted, ref } from "vue";

import type { TransferStatus } from "~/services/courseTransfer";
import { createReceiveUrl, createRoomToken, createSenderSession } from "~/services/courseTransfer";
import { useCoursePackStore } from "~/store/coursePack";

const coursePackStore = useCoursePackStore();
const selectedId = ref("");
const qrDataUrl = ref("");
const receiveUrl = ref("");
const copyMessage = ref("");
const message = ref("正在读取课程列表…");
const progress = ref(0);
const isSending = ref(false);
let session: { close: () => void } | undefined;
let disposed = false;

onMounted(async () => {
  try {
    await coursePackStore.setupCoursePacks();
    message.value = coursePackStore.coursePacks.length
      ? "请选择要发送的课程包"
      : "没有可发送的课程包";
  } catch {
    message.value = "无法读取课程列表，请先登录并连接网络";
  }
});

async function start() {
  if (!selectedId.value) return;

  try {
    await coursePackStore.setupCoursePack(selectedId.value);
    const coursePack = coursePackStore.currentCoursePack;
    if (!coursePack) throw new Error("课程包不存在");

    const roomToken = createRoomToken();
    receiveUrl.value = createReceiveUrl(roomToken);
    qrDataUrl.value = await QRCode.toDataURL(receiveUrl.value, {
      width: 360,
      margin: 2,
      errorCorrectionLevel: "M",
    });
    isSending.value = true;
    copyMessage.value = "";
    message.value = "等待手机扫描并连接…";
    const nextSession = await createSenderSession(roomToken, coursePack, update);
    if (disposed) {
      nextSession.close();
      return;
    }
    session = nextSession;
  } catch (error) {
    isSending.value = false;
    receiveUrl.value = "";
    qrDataUrl.value = "";
    message.value = error instanceof Error ? error.message : "无法启动课程传输";
  }
}

function update(next: { status: TransferStatus; progress?: number; message?: string }) {
  if (next.progress !== undefined) progress.value = next.progress;
  if (next.message) message.value = next.message;
  if (next.status === "completed" || next.status === "error") {
    isSending.value = false;
    receiveUrl.value = "";
    qrDataUrl.value = "";
  }
}

async function copyReceiveUrl() {
  if (!receiveUrl.value) return;

  try {
    await navigator.clipboard.writeText(receiveUrl.value);
    copyMessage.value = "已复制同步链接，请在手机端粘贴";
  } catch {
    copyMessage.value = "复制失败，请手动选择上方链接复制";
  }
}

function goBack() {
  session?.close();
  void navigateTo("/course-pack");
}

onUnmounted(() => {
  disposed = true;
  session?.close();
});
</script>
