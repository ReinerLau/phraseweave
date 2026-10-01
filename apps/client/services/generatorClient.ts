export interface GeneratorStatus {
  runtimeReady: boolean;
  modelDownloaded: boolean;
  initialization?: {
    state: "starting" | "downloading" | "ready" | "error";
    message: string;
    error?: string;
  };
}

export interface GeneratorOutput {
  name: string;
  content: string;
}

export interface GeneratorJob {
  id: string;
  state: "running" | "complete" | "failed";
  message?: string;
  error?: string;
  result?: { outputs: GeneratorOutput[] };
}

export interface DesktopBridge {
  getStatus(): Promise<GeneratorStatus>;
  startJob(payload: { text: string; mode: string; format: string }): Promise<{ id: string }>;
  getJob(id: string): Promise<GeneratorJob>;
  releaseJob(id: string): Promise<void>;
  consumeCapture(id: string): Promise<string>;
  retryGenerator(): Promise<void>;
}

declare global {
  interface Window {
    phraseweaveDesktop?: DesktopBridge;
  }
}

const SERVICE_URL = "http://127.0.0.1:8765";
type LocalFetchInit = RequestInit & { targetAddressSpace: "loopback" };

export function isDesktop() {
  return typeof window !== "undefined" && Boolean(window.phraseweaveDesktop);
}

async function localRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const options: LocalFetchInit = { ...init, targetAddressSpace: "loopback" };
  const response = await fetch(`${SERVICE_URL}${path}`, options);
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || `本地服务返回错误（${response.status}）。`);
  return body as T;
}

export function getGeneratorStatus() {
  if (window.phraseweaveDesktop) return window.phraseweaveDesktop.getStatus();
  return localRequest<GeneratorStatus>("/api/status");
}

export function startGeneratorJob(payload: { text: string; mode: string; format: string }) {
  if (window.phraseweaveDesktop) return window.phraseweaveDesktop.startJob(payload);
  return localRequest<{ id: string }>("/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function getGeneratorJob(id: string) {
  if (window.phraseweaveDesktop) return window.phraseweaveDesktop.getJob(id);
  return localRequest<GeneratorJob>(`/api/jobs/${id}`);
}

export async function releaseGeneratorJob(id: string) {
  if (window.phraseweaveDesktop) return window.phraseweaveDesktop.releaseJob(id);
  await localRequest<{ ok: boolean }>(`/api/jobs/${id}`, { method: "DELETE" });
}
