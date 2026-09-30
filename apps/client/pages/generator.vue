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
            class="btn btn-outline btn-sm"
            type="button"
            :disabled="connecting"
            @click="connectService"
          >
            {{ connecting ? "连接中…" : "连接本地服务" }}
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
          <template v-if="!serviceConnected">先启动并连接本地服务。</template>
          <template v-else-if="!runtimeReady || !modelDownloaded">请等待本地服务完成依赖和 Helsinki 模型初始化。</template>
          <template v-else>模型运行在本机；生成结果暂存在本页内存，下载后由浏览器保存。</template>
        </p>
      </div>
    </form>

    <section
      v-if="translations.length"
      class="rounded-xl border border-base-300 bg-base-100 p-5 shadow-sm"
    >
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 class="text-xl font-semibold">中文提示预览</h2>
          <p class="mt-1 text-sm opacity-70">检查生成结果后下载所需文件。</p>
        </div>
        <div class="flex flex-wrap gap-2">
          <button
            v-for="(file, index) in outputFiles"
            :key="file.name"
            class="btn btn-outline btn-sm"
            type="button"
            @click="downloadFile(file)"
          >
            下载 {{ file.name }}
          </button>
        </div>
      </div>
      <ol class="mt-5 flex flex-col gap-4">
        <li
          v-for="(item, index) in translations"
          :key="index"
          class="rounded-lg bg-base-200 p-4"
        >
          <p class="text-xs opacity-60">第 {{ index + 1 }} 句</p>
          <p class="mt-1">{{ item.sentence }}</p>
          <p class="mt-2 font-medium">{{ item.sentence_chinese }}</p>
        </li>
      </ol>
    </section>

    <section
      v-if="markdownContent !== null"
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
import { computed, onUnmounted, ref } from "vue";

type ExerciseMode = "standard" | "review";
type OutputFormat = "markdown" | "phraseweave" | "both";
type LocalFetchInit = RequestInit & { targetAddressSpace: "loopback" };
type GeneratorStatus = {
  runtimeReady: boolean;
  modelDownloaded: boolean;
};
type OutputFile = { name: string; content: string };
type TranslationRow = { sentence: string; sentence_chinese: string };
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
  result?: { translations: TranslationRow[]; outputs: OutputFile[] };
};

const serviceUrl = "http://127.0.0.1:8765";
const exerciseMode = ref<ExerciseMode>("standard");
const outputFormat = ref<OutputFormat>("markdown");
const englishText = ref("");
const serviceConnected = ref(false);
const connecting = ref(false);
const runtimeReady = ref(false);
const modelDownloaded = ref(false);
const serviceMessage = ref("启动本地服务后，在此连接。启动命令见下方提示。");
const activeJob = ref<JobState | null>(null);
const jobError = ref("");
const translations = ref<TranslationRow[]>([]);
const outputFiles = ref<OutputFile[]>([]);
const markdownFileName = ref("");
const markdownContent = ref<string | null>(null);
const markdownBlocks = computed(() => parseMarkdown(markdownContent.value || ""));
let pollTimer: ReturnType<typeof setTimeout> | undefined;
let disposed = false;

const canGenerate = computed(
  () =>
    serviceConnected.value &&
    runtimeReady.value &&
    modelDownloaded.value &&
    englishText.value.trim().length > 0,
);

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
    serviceMessage.value =
      "无法连接。请确认本地服务已完成初始化并保持运行。";
    jobError.value = "连接失败。确认 uv 已安装、服务终端没有初始化错误，并允许浏览器访问本机服务。";
  } finally {
    connecting.value = false;
  }
}

async function startJob(payload: Record<string, unknown>) {
  jobError.value = "";
  translations.value = [];
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
    await pollJob(body.id);
  } catch (error) {
    jobError.value = describeError(error);
  }
}

async function generate() {
  if (!canGenerate.value) return;
  await startJob({
    text: englishText.value,
    mode: exerciseMode.value,
    format: outputFormat.value,
  });
}

async function pollJob(jobId: string) {
  if (disposed) return;
  try {
    const response = await localFetch(`/api/jobs/${jobId}`);
    const job = (await response.json()) as JobState;
    if (!response.ok) throw new Error(job.error || "无法读取任务状态。");
    activeJob.value = job;
    if (job.state === "running") {
      pollTimer = setTimeout(() => void pollJob(jobId), 900);
      return;
    }
    activeJob.value = null;
    if (job.state === "failed") {
      jobError.value = job.error || "本地任务失败。";
      await releaseJob(jobId);
      return;
    }
    await connectService();
    if (job.result) {
      translations.value = job.result.translations || [];
      outputFiles.value = job.result.outputs || [];
      const markdownFile = outputFiles.value.find((file) => file.name.endsWith(".md"));
      if (markdownFile) {
        markdownFileName.value = markdownFile.name;
        markdownContent.value = markdownFile.content;
      }
    }
    await releaseJob(jobId);
  } catch (error) {
    activeJob.value = null;
    jobError.value = describeError(error);
  }
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
  translations.value = [];
  outputFiles.value = [];
  markdownContent.value = null;
});
</script>
