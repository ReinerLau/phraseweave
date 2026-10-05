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

const SERVICE_URL = "http://127.0.0.1:8765";
type LocalFetchInit = RequestInit & { targetAddressSpace?: "loopback" };

export function isLocalPackage() {
  return (
    typeof document !== "undefined" &&
    document.querySelector('meta[name="phraseweave-runtime"]')?.getAttribute("content") ===
      "local-package"
  );
}

async function localRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const packagePage = isLocalPackage();
  const options: LocalFetchInit = packagePage
    ? { ...init }
    : { ...init, targetAddressSpace: "loopback" };
  const response = await fetch(
    `${packagePage ? window.location.origin : SERVICE_URL}${path}`,
    options,
  );
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || `本地服务返回错误（${response.status}）。`);
  return body as T;
}

export function getGeneratorStatus() {
  return localRequest<GeneratorStatus>("/api/status");
}

export function startGeneratorJob(payload: { text: string; format: string }) {
  return localRequest<{ id: string }>("/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function getGeneratorJob(id: string) {
  return localRequest<GeneratorJob>(`/api/jobs/${id}`);
}

export async function releaseGeneratorJob(id: string) {
  await localRequest<{ ok: boolean }>(`/api/jobs/${id}`, { method: "DELETE" });
}

export async function consumeCapture(id: string) {
  if (!isLocalPackage()) throw new Error("Capture is only available in the local app.");
  const result = await localRequest<{ text: string }>(`/api/captures/${id}`);
  return result.text;
}

export async function retryGenerator() {
  if (!isLocalPackage()) return;
  await localRequest<{ ok: boolean }>("/api/retry", { method: "POST" });
}
