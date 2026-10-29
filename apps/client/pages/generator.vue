<template>
  <main class="mx-auto flex w-full max-w-4xl flex-col gap-6 py-8">
    <header class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <p class="text-sm opacity-60">PhraseWeave 本地工具</p>
        <h1 class="mt-1 text-3xl font-bold">实义词与功能词练习生成器</h1>
        <p class="mt-2 max-w-2xl text-sm opacity-75">
          在本机分句并生成英文练习；练到对应题目时才翻译。练习时英文内容会发送至 Bilibili。
        </p>
      </div>

      <div class="flex shrink-0 items-center gap-2">
        <CommonBackLink
          label="返回练习清单"
          to="/"
        />
        <RemoteLogout />
      </div>
    </header>

    <section class="rounded-xl border border-base-300 bg-base-100 p-5 shadow-sm">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 class="font-semibold">本地服务</h2>
          <p class="mt-1 text-sm opacity-70">{{ serviceMessage }}</p>
        </div>
        <div class="flex flex-wrap gap-2">
          <button
            class="btn btn-square btn-ghost btn-sm"
            type="button"
            :disabled="connecting"
            :aria-label="connecting ? '正在连接本地服务' : '刷新本地服务连接'"
            :title="connecting ? '正在连接本地服务' : '刷新本地服务连接'"
            @click="refreshService"
          >
            <span
              class="i-ph-arrows-clockwise h-5 w-5"
              :class="{ 'animate-spin': connecting }"
              aria-hidden="true"
            ></span>
          </button>
        </div>
      </div>
      <div
        v-if="serviceConnected"
        class="mt-3 flex flex-wrap gap-2 text-xs"
      >
        <span
          class="badge"
          :class="runtimeReady ? 'badge-success' : 'badge-ghost'"
        >
          生成引擎 {{ runtimeReady ? "已就绪" : "未就绪" }}
        </span>
        <span
          v-if="supportsPublicTranslation"
          class="badge badge-outline"
          >Index-Translate 公网翻译</span
        >
        <span
          v-else
          class="badge badge-error"
          >公网翻译不可用</span
        >
      </div>
      <div
        v-if="activeJob"
        class="mt-4"
        role="status"
        aria-live="polite"
      >
        <progress class="progress progress-primary w-full"></progress>
        <p class="mt-2 text-sm">{{ activeJob.message || "正在处理…" }}</p>
      </div>
      <p
        v-if="jobError"
        class="mt-3 text-sm text-error"
        role="alert"
      >
        {{ jobError }}
      </p>
    </section>

    <section
      v-if="captureStatus || captureError"
      class="rounded-xl border border-base-300 bg-base-100 p-5 shadow-sm"
      aria-live="polite"
    >
      <h2 class="font-semibold">从选中文本创建练习</h2>
      <p class="mt-2 whitespace-pre-wrap text-sm opacity-75">{{ captureStatus }}</p>
      <p
        v-if="captureError"
        class="mt-3 text-sm text-error"
        role="alert"
      >
        {{ captureError }}
      </p>
    </section>

    <form
      class="flex flex-col gap-5 rounded-xl border border-base-300 bg-base-100 p-5 shadow-sm"
      @submit.prevent="generate"
    >
      <label class="form-control">
        <span class="label-text mb-2 font-semibold">英文教材</span>
        <textarea
          v-model="englishText"
          class="textarea textarea-bordered min-h-56 w-full text-base"
          placeholder="Paste English text here…"
          maxlength="30000"
          :disabled="generationBusy || savingExercise"
          required
        ></textarea>
        <span class="mt-1 text-right text-xs opacity-60">{{ englishText.length }} / 30,000</span>
      </label>

      <div class="flex flex-wrap items-center gap-3">
        <button
          class="btn btn-primary"
          type="submit"
          :disabled="!canGenerate"
        >
          生成分段练习
        </button>
        <p class="text-sm opacity-70">
          <template v-if="!serviceConnected"
            >请先启动本地服务；连接失败后点击上方刷新按钮。</template
          >
          <template v-else-if="!serviceReady">请等待本地服务完成初始化。</template>
          <template v-else>生成无需联网；练习到对应题目时需要联网翻译。</template>
        </p>
      </div>
    </form>

    <section
      v-if="outputFiles.length"
      class="rounded-xl border border-base-300 bg-base-100 p-5 shadow-sm"
    >
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 class="text-xl font-semibold">生成文件</h2>
          <p class="mt-1 text-sm opacity-70">下载本次生成的文件。</p>
        </div>
        <div class="flex w-full min-w-0 flex-wrap gap-2 sm:w-auto sm:max-w-full">
          <label
            v-if="outputFiles.some((file) => file.name.endsWith('.json'))"
            class="form-control w-full min-w-0"
          >
            <span class="label-text mb-2 font-semibold">练习名称</span>
            <input
              v-model="exerciseTitle"
              class="input input-bordered w-full"
              type="text"
              :placeholder="defaultExerciseTitle"
              :disabled="savingExercise"
            />
            <span class="mb-2 mt-1 text-xs opacity-60">留空使用默认名称</span>
          </label>
          <button
            v-if="outputFiles.some((file) => file.name.endsWith('.json'))"
            class="btn btn-primary btn-sm"
            type="button"
            :disabled="savingExercise"
            @click="saveAndOpenExercise"
          >
            {{ savingExercise ? "正在保存…" : "保存并进入练习" }}
          </button>
          <button
            v-for="file in outputFiles"
            :key="file.name"
            class="btn btn-outline btn-sm"
            type="button"
            @click="downloadFile(file)"
          >
            下载 {{ file.name }}
          </button>
        </div>
      </div>
    </section>

    <section
      v-if="practicePreview.length"
      class="rounded-xl border border-base-300 bg-base-100 p-5 shadow-sm"
    >
      <h2 class="text-xl font-semibold">首次练习题序预览</h2>
      <ol class="mt-4 space-y-4">
        <li
          v-for="(item, index) in practicePreview"
          :key="index"
        >
          <p class="font-semibold">第 {{ index + 1 }} 句：{{ item.sentence }}</p>
          <ol class="mt-2 list-decimal space-y-1 pl-6 text-sm">
            <li
              v-for="(step, stepIndex) in item.steps"
              :key="stepIndex"
            >
              {{ step }}
            </li>
          </ol>
        </li>
      </ol>
    </section>
  </main>
</template>

<script setup lang="ts">
import { navigateTo, useRoute } from "#app";
import { computed, onMounted, onUnmounted, ref } from "vue";

import type { GeneratorJob, GeneratorOutput } from "~/services/generatorClient";
import { useActiveCourseMap } from "~/composables/courses/activeCourse";
import {
  consumeCapture,
  getGeneratorJob,
  getGeneratorStatus,
  isLocalPackage,
  releaseGeneratorJob,
  retryGenerator,
  startGeneratorJob,
} from "~/services/generatorClient";
import { normalizeExerciseImport, saveLocalExercise } from "~/services/localExerciseDb";

type OutputFile = GeneratorOutput;
const route = useRoute();
const rawCaptureId = route.query.capture;
const captureId = typeof rawCaptureId === "string" ? rawCaptureId : "";
// Base64URL survives the router's fragment normalization without changing text delimiters.
const selectedText =
  typeof window === "undefined"
    ? null
    : new URLSearchParams(window.location.hash.slice(1)).get("text");
const supportsPublicTranslation = ref(false);
const englishText = ref("");
const serviceConnected = ref(false);
const connecting = ref(false);
const runtimeReady = ref(false);
const initializationState = ref("starting");
const initializationError = ref("");
const serviceMessage = ref("正在连接本地服务…");
const activeJob = ref<GeneratorJob | null>(null);
const submitting = ref(false);
const generationBusy = computed(() => submitting.value || Boolean(activeJob.value));
const jobError = ref("");
const outputFiles = ref<OutputFile[]>([]);
const practicePreview = ref<Array<{ sentence: string; steps: string[] }>>([]);
const generatedText = ref("");
const defaultExerciseTitle = computed(() =>
  generatedText.value.replace(/\s+/g, " ").trim().slice(0, 80),
);
const exerciseTitle = ref("");
const savingExercise = ref(false);
const captureStatus = ref("");
const captureError = ref("");
let pollTimer: ReturnType<typeof setTimeout> | undefined;
let statusTimer: ReturnType<typeof setTimeout> | undefined;
let disposed = false;

const { updateActiveCourseMap } = useActiveCourseMap();

const serviceReady = computed(
  () =>
    serviceConnected.value &&
    runtimeReady.value &&
    initializationState.value === "ready" &&
    !initializationError.value,
);
const canGenerate = computed(
  () =>
    serviceReady.value &&
    englishText.value.trim().length > 0 &&
    !generationBusy.value &&
    !savingExercise.value,
);

onMounted(() => {
  void connectService();
  if (selectedText !== null) {
    window.history.replaceState(
      window.history.state,
      "",
      window.location.pathname + window.location.search,
    );
    try {
      if (!/^[A-Za-z0-9_-]*$/.test(selectedText) || selectedText.length > 160000) {
        throw new Error("无效的选中文本，请从浏览器重新导入。");
      }
      const bytes = Uint8Array.from(
        atob(selectedText.replaceAll("-", "+").replaceAll("_", "/")),
        (character) => character.charCodeAt(0),
      );
      receiveCaptureText(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    } catch {
      captureError.value = "无效的选中文本，请从浏览器重新导入。";
      captureStatus.value = "无法读取选中文本。";
    }
  } else if (captureId) {
    const cleanUrl = new URL(window.location.href);
    cleanUrl.searchParams.delete("capture");
    window.history.replaceState(window.history.state, "", cleanUrl.pathname + cleanUrl.search);
    if (!/^[a-f0-9-]{32,36}$/i.test(captureId)) {
      captureError.value = "无效的浏览器扩展请求，请从文章中重新选择文本。";
      captureStatus.value = "无法读取选中文本。";
      return;
    }
    void consumeCapture(captureId)
      .then(receiveCaptureText)
      .catch((error) => {
        captureError.value = describeError(error);
        captureStatus.value = "无法读取选中文本。";
      });
  }
});

function receiveCaptureText(text: string) {
  if (!text.trim()) {
    captureError.value = "没有收到选中文本，请重新选择后再试。";
    captureStatus.value = "无法创建练习。";
    return;
  }
  if (text.length > 30000) {
    captureError.value = "选中文本超过 30,000 个字符，请缩短选择后再试。";
    captureStatus.value = `已接收 ${text.length.toLocaleString()} 个字符。`;
    return;
  }
  englishText.value = text;
  captureStatus.value = "选中文本已填入下方，可编辑文本，再点击“生成分段练习”。";
}

async function connectService() {
  connecting.value = true;
  try {
    const status = await getGeneratorStatus();
    serviceConnected.value = true;
    runtimeReady.value = status.runtimeReady;
    supportsPublicTranslation.value =
      Array.isArray(status.translationProviders) &&
      status.translationProviders.includes("index-translate");
    initializationState.value = status.initialization?.state || "ready";
    initializationError.value = status.initialization?.error || "";
    if (status.initialization?.state === "error") {
      serviceMessage.value = status.initialization.error || "本地生成引擎初始化失败。";
    } else if (status.initialization?.state === "downloading") {
      serviceMessage.value = status.initialization.message;
    } else if (!serviceReady.value) {
      serviceMessage.value = isLocalPackage()
        ? "本地服务尚未完成初始化，请稍候。"
        : "本地服务尚未完成初始化，请查看启动服务的终端。";
    } else {
      serviceMessage.value = "本地生成引擎已就绪，练习时按题使用 Index-Translate 翻译。";
    }
  } catch {
    serviceConnected.value = false;
    runtimeReady.value = false;
    supportsPublicTranslation.value = false;
    initializationState.value = "starting";
    initializationError.value = "";
    serviceMessage.value = isLocalPackage()
      ? "正在启动本地生成引擎，请稍候。"
      : "无法连接本地服务。请启动 PhraseWeave 桌面版或本地服务。";
  } finally {
    connecting.value = false;
    const refreshDelay = isLocalPackage()
      ? !serviceReady.value && !initializationError.value
        ? 1500
        : undefined
      : serviceReady.value
        ? 10000
        : 3000;
    if (!disposed && refreshDelay !== undefined && !statusTimer) {
      statusTimer = setTimeout(() => {
        statusTimer = undefined;
        void connectService();
      }, refreshDelay);
    }
  }
}

async function refreshService() {
  if (isLocalPackage() && initializationError.value) {
    try {
      await retryGenerator();
      initializationError.value = "";
    } catch (error) {
      serviceMessage.value = describeError(error);
      return;
    }
  }
  await connectService();
}

async function startJob(payload: { text: string }): Promise<OutputFile[] | undefined> {
  jobError.value = "";
  clearGeneratedOutputs();
  generatedText.value = payload.text;
  exerciseTitle.value = defaultExerciseTitle.value;
  try {
    const body = await startGeneratorJob(payload);
    activeJob.value = { id: body.id, state: "running", message: "正在启动…" };
    return await pollJob(body.id);
  } catch (error) {
    jobError.value = describeError(error);
    return undefined;
  }
}

function clearGeneratedOutputs() {
  outputFiles.value = [];
  practicePreview.value = [];
}

async function generate() {
  if (!canGenerate.value) return;
  submitting.value = true;
  captureError.value = "";
  try {
    await startJob({
      text: englishText.value,
    });
  } finally {
    submitting.value = false;
  }
}

async function pollJob(jobId: string): Promise<OutputFile[] | undefined> {
  if (disposed) return undefined;
  try {
    const job = await getGeneratorJob(jobId);
    activeJob.value = job;
    if (job.state === "running") {
      return await new Promise<OutputFile[] | undefined>((resolve) => {
        pollTimer = setTimeout(() => {
          void pollJob(jobId).then(resolve);
        }, 900);
      });
    }
    activeJob.value = null;
    if (job.state === "failed") {
      jobError.value = job.error || "本地任务失败。";
      await releaseGeneratorJob(jobId);
      return undefined;
    }
    await connectService();
    const outputs = job.result?.outputs || [];
    if (job.result) {
      outputFiles.value = outputs;
      practicePreview.value = job.result.preview ?? [];
    }
    await releaseGeneratorJob(jobId);
    return outputs;
  } catch (error) {
    activeJob.value = null;
    jobError.value = describeError(error);
    return undefined;
  }
}

async function saveAndOpenExercise() {
  if (savingExercise.value) return;
  savingExercise.value = true;
  jobError.value = "";
  try {
    await importGeneratedExercise(outputFiles.value, generatedText.value);
  } catch (error) {
    jobError.value = describeError(error);
  } finally {
    savingExercise.value = false;
  }
}

async function importGeneratedExercise(outputs: OutputFile[], sourceText: string) {
  const jsonFile = outputs.find((file) => file.name.endsWith(".json"));
  if (!jsonFile) throw new Error("生成结果中没有 PhraseWeave JSON 文件。");
  const [coursePack] = normalizeExerciseImport(JSON.parse(jsonFile.content), {
    title: exerciseTitle.value.trim() || sourceText.replace(/\s+/g, " ").trim().slice(0, 80),
  });
  const course = coursePack?.courses[0];
  if (!course || course.statements.length === 0)
    throw new Error("生成结果中没有可练习的学习单元。");
  await saveLocalExercise(coursePack);
  updateActiveCourseMap(coursePack.id, course.id);
  captureStatus.value = "练习已导入，正在打开练习…";
  await navigateTo(`/game/${coursePack.id}/${course.id}`);
}

function downloadFile(file: OutputFile) {
  const url = URL.createObjectURL(
    new Blob([file.content], { type: "application/json;charset=utf-8" }),
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = file.name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function describeError(error: unknown) {
  return error instanceof Error ? error.message : "本地服务请求失败。";
}

onUnmounted(() => {
  disposed = true;
  if (pollTimer) clearTimeout(pollTimer);
  if (statusTimer) clearTimeout(statusTimer);
  outputFiles.value = [];
});
</script>
