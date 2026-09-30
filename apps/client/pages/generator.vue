<template>
  <main class="mx-auto flex w-full max-w-4xl flex-col gap-6 py-8">
    <header>
      <p class="text-sm opacity-60">PhraseWeave 本地工具</p>
      <h1 class="mt-1 text-3xl font-bold">渐进学习单元生成器</h1>
      <p class="mt-2 max-w-2xl text-sm opacity-75">
        使用本机模型生成整句中文提示。英文原句和学习单元只在本机处理。
      </p>
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
            @click="connectService"
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
          Transformers {{ runtimeReady ? "已就绪" : "未就绪" }}
        </span>
        <span
          class="badge"
          :class="modelDownloaded ? 'badge-success' : 'badge-ghost'"
        >
          Helsinki 模型 {{ modelDownloaded ? "已下载" : "未下载" }}
        </span>
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
      v-if="captureMode"
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
      <button
        v-if="captureText && captureError && captureText.length <= 30000"
        class="btn btn-primary mt-4"
        type="button"
        :disabled="captureRunning"
        @click="runCapture"
      >
        {{ captureRunning ? "正在处理…" : "重试" }}
      </button>
    </section>

    <form
      v-if="!captureMode"
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
          required
        ></textarea>
        <span class="mt-1 text-right text-xs opacity-60">{{ englishText.length }} / 30,000</span>
      </label>

      <div class="grid gap-4 sm:grid-cols-2">
        <label class="form-control">
          <span class="label-text mb-2 font-semibold">练习模式</span>
          <select
            v-model="exerciseMode"
            class="select select-bordered"
          >
            <option value="standard">常规</option>
            <option value="review">复习</option>
          </select>
        </label>
        <label class="form-control">
          <span class="label-text mb-2 font-semibold">导出格式</span>
          <select
            v-model="outputFormat"
            class="select select-bordered"
          >
            <option value="markdown">Markdown</option>
            <option value="phraseweave">PhraseWeave JSON</option>
            <option value="both">两种格式</option>
          </select>
        </label>
      </div>

      <div class="flex flex-wrap items-center gap-3">
        <button
          class="btn btn-primary"
          type="submit"
          :disabled="!canGenerate || Boolean(activeJob)"
        >
          生成学习单元
        </button>
        <p class="text-sm opacity-70">
          <template v-if="!serviceConnected"
            >请先启动本地服务；连接失败后点击上方刷新按钮。</template
          >
          <template v-else-if="!runtimeReady || !modelDownloaded"
            >请等待本地服务完成依赖和 Helsinki 模型初始化。</template
          >
          <template v-else>模型运行在本机；生成结果暂存在本页内存，下载后由浏览器保存。</template>
        </p>
      </div>
    </form>

    <section
      v-if="!captureMode && outputFiles.length"
      class="rounded-xl border border-base-300 bg-base-100 p-5 shadow-sm"
    >
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 class="text-xl font-semibold">生成文件</h2>
          <p class="mt-1 text-sm opacity-70">下载本次生成的文件。</p>
        </div>
        <div class="flex flex-wrap gap-2">
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
      v-if="!captureMode && markdownContent !== null"
      class="rounded-xl border border-base-300 bg-base-100 p-5 shadow-sm"
    >
      <div class="flex flex-wrap items-baseline justify-between gap-2">
        <h2 class="text-xl font-semibold">Markdown 文件内容</h2>
        <span class="text-sm opacity-60">{{ markdownFileName }}</span>
      </div>
      <article class="mt-4 max-h-[36rem] overflow-auto rounded-lg bg-base-200 p-4">
        <template
          v-for="(block, index) in markdownBlocks"
          :key="index"
        >
          <h1
            v-if="block.type === 'heading' && block.level === 1"
            class="mt-0 text-2xl font-bold"
          >
            {{ block.text }}
          </h1>
          <h2
            v-else-if="block.type === 'heading' && block.level === 2"
            class="mt-6 text-xl font-semibold"
          >
            {{ block.text }}
          </h2>
          <h3
            v-else-if="block.type === 'heading'"
            class="mt-4 text-lg font-semibold"
          >
            {{ block.text }}
          </h3>
          <p
            v-else-if="block.type === 'paragraph'"
            class="my-3 whitespace-pre-wrap"
          >
            {{ block.text }}
          </p>
          <pre
            v-else-if="block.type === 'code'"
            class="whitespace-pre-wrap rounded bg-base-300"
          ><code>{{ block.text }}</code></pre>
          <div
            v-else-if="block.type === 'table'"
            class="overflow-x-auto"
          >
            <table class="table table-zebra table-sm">
              <thead>
                <tr>
                  <th
                    v-for="(cell, cellIndex) in block.headers"
                    :key="cellIndex"
                  >
                    {{ cell }}
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="(row, rowIndex) in block.rows"
                  :key="rowIndex"
                >
                  <td
                    v-for="(cell, cellIndex) in row"
                    :key="cellIndex"
                  >
                    {{ cell }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </template>
      </article>
    </section>
  </main>
</template>

<script setup lang="ts">
import { navigateTo, useRoute } from "#app";
import { computed, onMounted, onUnmounted, ref } from "vue";

import { useActiveCourseMap } from "~/composables/courses/activeCourse";
import { normalizeExerciseImport, saveLocalExercise } from "~/services/localExerciseDb";

type ExerciseMode = "standard" | "review";
type OutputFormat = "markdown" | "phraseweave" | "both";
type LocalFetchInit = RequestInit & { targetAddressSpace: "loopback" };
type GeneratorStatus = {
  runtimeReady: boolean;
  modelDownloaded: boolean;
};
type OutputFile = { name: string; content: string };
type MarkdownBlock =
  | { type: "heading"; level: number; text: string }
  | { type: "paragraph"; text: string }
  | { type: "code"; text: string }
  | { type: "table"; headers: string[]; rows: string[][] };
type JobState = {
  id: string;
  state: "running" | "complete" | "failed";
  message?: string;
  error?: string;
  result?: { outputs: OutputFile[] };
};

const serviceUrl = "http://127.0.0.1:8765";
const route = useRoute();
const rawCaptureId = route.query.capture;
const captureId = typeof rawCaptureId === "string" ? rawCaptureId : "";
const captureMode = Boolean(captureId);
const exerciseMode = ref<ExerciseMode>("standard");
const outputFormat = ref<OutputFormat>("markdown");
const englishText = ref("");
const serviceConnected = ref(false);
const connecting = ref(false);
const runtimeReady = ref(false);
const modelDownloaded = ref(false);
const serviceMessage = ref("正在连接本地服务…");
const activeJob = ref<JobState | null>(null);
const jobError = ref("");
const outputFiles = ref<OutputFile[]>([]);
const markdownFileName = ref("");
const markdownContent = ref<string | null>(null);
const markdownBlocks = computed(() => parseMarkdown(markdownContent.value || ""));
const captureText = ref("");
const captureStatus = ref("正在接收选中文本…");
const captureError = ref("");
const captureRunning = ref(false);
let pollTimer: ReturnType<typeof setTimeout> | undefined;
let disposed = false;
let captureTimer: ReturnType<typeof setTimeout> | undefined;

const { updateActiveCourseMap } = useActiveCourseMap();

const canGenerate = computed(
  () =>
    serviceConnected.value &&
    runtimeReady.value &&
    modelDownloaded.value &&
    englishText.value.trim().length > 0,
);

onMounted(() => {
  if (captureMode) {
    window.addEventListener("message", receiveCaptureMessage);
    if (!/^[a-f0-9-]{32,36}$/i.test(captureId)) {
      captureError.value = "无效的浏览器扩展请求，请从文章中重新选择文本。";
      captureStatus.value = "无法读取选中文本。";
      return;
    }
    requestCapture();
  } else {
    void connectService();
  }
});

function requestCapture() {
  captureStatus.value = "正在接收选中文本…";
  captureError.value = "";
  window.postMessage(
    { type: "PHRASEWEAVE_CAPTURE_READY", requestId: captureId },
    window.location.origin,
  );
  if (captureTimer) clearTimeout(captureTimer);
  captureTimer = setTimeout(() => {
    if (!captureText.value) {
      captureError.value = "未能连接 PhraseWeave 浏览器扩展。请重新从文章选择文本并右键操作。";
      captureStatus.value = "等待扩展传入选中文本。";
    }
  }, 10000);
}

function receiveCaptureMessage(event: MessageEvent) {
  const message = event.data as { type?: string; requestId?: string; text?: string } | null;
  if (
    event.source !== window ||
    event.origin !== window.location.origin ||
    message?.type !== "PHRASEWEAVE_CAPTURE_RESULT" ||
    message.requestId !== captureId ||
    typeof message.text !== "string"
  ) {
    return;
  }

  if (captureTimer) clearTimeout(captureTimer);
  captureText.value = message.text.trim();
  window.postMessage(
    { type: "PHRASEWEAVE_CAPTURE_ACK", requestId: captureId },
    window.location.origin,
  );
  if (!captureText.value) {
    captureError.value = "没有收到选中文本，请重新选择后再试。";
    captureStatus.value = "无法创建练习。";
    return;
  }
  if (captureText.value.length > 30000) {
    captureError.value = "选中文本超过 30,000 个字符，请缩短选择后再试。";
    captureStatus.value = `已接收 ${captureText.value.length.toLocaleString()} 个字符。`;
    return;
  }
  void runCapture();
}

async function localFetch(path: string, init: RequestInit = {}) {
  const options: LocalFetchInit = { ...init, targetAddressSpace: "loopback" };
  return fetch(`${serviceUrl}${path}`, options);
}

async function connectService() {
  connecting.value = true;
  jobError.value = "";
  try {
    const response = await localFetch("/api/status");
    if (!response.ok) throw new Error(`本地服务返回错误（${response.status}）。`);
    const status = (await response.json()) as GeneratorStatus;
    serviceConnected.value = true;
    runtimeReady.value = status.runtimeReady;
    modelDownloaded.value = status.modelDownloaded;
    if (!status.runtimeReady || !status.modelDownloaded) {
      serviceMessage.value = "本地服务尚未完成初始化，请查看启动服务的终端。";
    } else {
      serviceMessage.value = "本地服务和翻译模型已就绪。";
    }
  } catch {
    serviceConnected.value = false;
    serviceMessage.value = "无法连接本地服务。请先启动本地服务，再点击刷新按钮重试。";
  } finally {
    connecting.value = false;
  }
}

async function startJob(payload: Record<string, unknown>): Promise<OutputFile[] | undefined> {
  jobError.value = "";
  outputFiles.value = [];
  markdownFileName.value = "";
  markdownContent.value = null;
  try {
    const response = await localFetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || "无法启动本地任务。");
    activeJob.value = { id: body.id, state: "running", message: "正在启动…" };
    return await pollJob(body.id);
  } catch (error) {
    jobError.value = describeError(error);
    return undefined;
  }
}

async function generate() {
  if (!canGenerate.value) return;
  const outputs = await startJob({
    text: englishText.value,
    mode: exerciseMode.value,
    format: outputFormat.value,
  });
  if (captureMode && outputs) await importGeneratedExercise(outputs);
}

async function pollJob(jobId: string): Promise<OutputFile[] | undefined> {
  if (disposed) return undefined;
  try {
    const response = await localFetch(`/api/jobs/${jobId}`);
    const job = (await response.json()) as JobState;
    if (!response.ok) throw new Error(job.error || "无法读取任务状态。");
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
      await releaseJob(jobId);
      return undefined;
    }
    await connectService();
    const outputs = job.result?.outputs || [];
    if (job.result) {
      outputFiles.value = outputs;
      const markdownFile = outputFiles.value.find((file) => file.name.endsWith(".md"));
      if (markdownFile) {
        markdownFileName.value = markdownFile.name;
        markdownContent.value = markdownFile.content;
      }
    }
    await releaseJob(jobId);
    return outputs;
  } catch (error) {
    activeJob.value = null;
    jobError.value = describeError(error);
    return undefined;
  }
}

async function runCapture() {
  if (!captureText.value || captureRunning.value) return;
  captureRunning.value = true;
  captureError.value = "";
  jobError.value = "";
  captureStatus.value = "正在连接本地生成服务…";
  exerciseMode.value = "standard";
  outputFormat.value = "phraseweave";
  englishText.value = captureText.value;

  try {
    await connectService();
    if (!canGenerate.value) {
      throw new Error(serviceMessage.value || "本地生成服务尚未就绪。请启动服务后重试。");
    }
    captureStatus.value = "正在生成学习单元…";
    const outputs = await startJob({
      text: captureText.value,
      mode: "standard",
      format: "phraseweave",
    });
    if (!outputs) throw new Error(jobError.value || "学习单元生成失败，请重试。");
    captureStatus.value = "正在导入练习…";
    await importGeneratedExercise(outputs);
  } catch (error) {
    captureError.value = describeError(error);
    captureStatus.value = "练习尚未创建。选中文本仍保留在此页面，可以重试。";
  } finally {
    captureRunning.value = false;
  }
}

async function importGeneratedExercise(outputs: OutputFile[]) {
  const jsonFile = outputs.find((file) => file.name.endsWith(".json"));
  if (!jsonFile) throw new Error("生成结果中没有 PhraseWeave JSON 文件。");
  const [coursePack] = normalizeExerciseImport(JSON.parse(jsonFile.content), {
    title: captureText.value.replace(/\s+/g, " ").trim().slice(0, 80),
  });
  const course = coursePack?.courses[0];
  if (!course || course.statements.length === 0)
    throw new Error("生成结果中没有可练习的学习单元。");
  await saveLocalExercise(coursePack);
  updateActiveCourseMap(coursePack.id, course.id);
  captureStatus.value = "练习已导入，正在打开练习…";
  await navigateTo(`/game/${coursePack.id}/${course.id}`);
}

async function releaseJob(jobId: string) {
  const response = await localFetch(`/api/jobs/${jobId}`, { method: "DELETE" });
  if (!response.ok) throw new Error("无法释放本地任务结果，请重启本地服务后重试。");
}

function downloadFile(file: OutputFile) {
  const type = file.name.endsWith(".json")
    ? "application/json;charset=utf-8"
    : "text/markdown;charset=utf-8";
  const url = URL.createObjectURL(new Blob([file.content], { type }));
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

function parseMarkdown(source: string): MarkdownBlock[] {
  const lines = source.split(/\r?\n/);
  const blocks: MarkdownBlock[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index].trim();
    if (!line) {
      index += 1;
      continue;
    }

    if (line.startsWith("```")) {
      const codeLines: string[] = [];
      index += 1;
      while (index < lines.length && !lines[index].trim().startsWith("```")) {
        codeLines.push(lines[index]);
        index += 1;
      }
      blocks.push({ type: "code", text: codeLines.join("\n") });
      index += 1;
      continue;
    }

    const heading = /^(#{1,6})\s+(.+)$/.exec(line);
    if (heading) {
      blocks.push({ type: "heading", level: heading[1].length, text: heading[2] });
      index += 1;
      continue;
    }

    if (
      line.startsWith("|") &&
      index + 1 < lines.length &&
      /^\|?[\s:|-]+\|?$/.test(lines[index + 1].trim())
    ) {
      const headers = parseMarkdownTableRow(line);
      const rows: string[][] = [];
      index += 2;
      while (index < lines.length && lines[index].trim().startsWith("|")) {
        rows.push(parseMarkdownTableRow(lines[index].trim()));
        index += 1;
      }
      blocks.push({ type: "table", headers, rows });
      continue;
    }

    blocks.push({ type: "paragraph", text: line });
    index += 1;
  }

  return blocks;
}

function parseMarkdownTableRow(line: string): string[] {
  const trimmed = line.replace(/^\|/, "").replace(/\|$/, "");
  const cells: string[] = [];
  let cell = "";
  for (let index = 0; index < trimmed.length; index += 1) {
    const character = trimmed[index];
    if (character === "\\" && trimmed[index + 1] === "|") {
      cell += "|";
      index += 1;
    } else if (character === "|") {
      cells.push(cell.trim().replaceAll("<br>", "\n"));
      cell = "";
    } else {
      cell += character;
    }
  }
  cells.push(cell.trim().replaceAll("<br>", "\n"));
  return cells;
}

onUnmounted(() => {
  disposed = true;
  if (pollTimer) clearTimeout(pollTimer);
  if (captureTimer) clearTimeout(captureTimer);
  window.removeEventListener("message", receiveCaptureMessage);
  outputFiles.value = [];
  markdownContent.value = null;
});
</script>
