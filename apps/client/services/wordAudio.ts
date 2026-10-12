import { localServiceFetch } from "~/services/generatorClient";

export function isSpeakableWord(text: string) {
  return text.length <= 100 && /^[A-Za-z]+(?:['‘’][A-Za-z]+)*$/.test(text);
}

async function checkResponse(response: Response) {
  if (!response.ok) {
    const body = await response.json().catch(() => undefined);
    throw new Error(body?.error || "朗读服务暂时不可用，请重试。");
  }
}

export function fetchWordAudio(text: string, signal: AbortSignal) {
  return fetchAudio(text, signal);
}

export function fetchSentenceAudio(text: string, signal: AbortSignal) {
  return fetchAudio(text, signal, "sentence");
}

async function fetchAudio(text: string, signal: AbortSignal, kind?: "sentence") {
  let response: Response;
  try {
    response = await localServiceFetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, ...(kind ? { kind } : {}) }),
      signal,
    });
  } catch (error) {
    if (signal.aborted) throw error;
    throw new Error("无法连接朗读服务，请启动本机服务后重试。");
  }
  await checkResponse(response);
  if (!response.headers.get("Content-Type")?.startsWith("audio/mpeg")) {
    throw new Error("没有收到朗读音频，请重试。");
  }
  const blob = await response.blob();
  if (!blob.size) throw new Error("没有收到朗读音频，请重试。");
  return blob;
}

export async function deleteWordAudioCache() {
  let response: Response;
  try {
    response = await localServiceFetch("/api/tts/cache", { method: "DELETE" });
  } catch {
    throw new Error("无法连接朗读服务，请启动本机服务后重试。");
  }
  await checkResponse(response);
}

export interface TtsStatus {
  state: "starting" | "downloading" | "loading" | "ready" | "error";
  message: string;
  error?: string;
}

async function requestTtsStatus(path: string, init?: RequestInit): Promise<TtsStatus> {
  let response: Response;
  try {
    response = await localServiceFetch(path, init);
  } catch {
    throw new Error("无法连接朗读服务，请启动本机服务后重试。");
  }
  await checkResponse(response);
  return response.json();
}

export function getTtsStatus(signal?: AbortSignal) {
  return requestTtsStatus("/api/tts/status", { signal });
}

export function retryTts(signal?: AbortSignal) {
  return requestTtsStatus("/api/tts/retry", { method: "POST", signal });
}
