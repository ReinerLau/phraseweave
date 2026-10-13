import { onMounted, onUnmounted, ref } from "vue";

import type { TtsStatus } from "~/services/wordAudio";
import { getTtsStatus, retryTts } from "~/services/wordAudio";

/** Poll only while this view is open and local audio is being prepared. */
export function useTtsStatus() {
  const status = ref<TtsStatus>({ state: "starting", message: "正在查询朗读状态…" });
  const retrying = ref(false);
  let active = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let controller: AbortController | undefined;

  async function refresh(restart = false) {
    clearTimeout(timer);
    controller?.abort();
    const request = new AbortController();
    controller = request;
    try {
      const next = await (restart ? retryTts(request.signal) : getTtsStatus(request.signal));
      if (!active || request.signal.aborted) return;
      status.value = next;
      if (!["ready", "error"].includes(next.state)) {
        timer = setTimeout(() => void refresh(), 2000);
      }
    } catch (error) {
      if (!active || request.signal.aborted) return;
      status.value = {
        state: "error",
        message: error instanceof Error ? error.message : "无法查询朗读状态，请重试。",
      };
    }
  }

  async function retry() {
    if (retrying.value) return;
    retrying.value = true;
    try {
      await refresh(true);
    } finally {
      retrying.value = false;
    }
  }

  onMounted(() => {
    active = true;
    void refresh();
  });
  onUnmounted(() => {
    active = false;
    clearTimeout(timer);
    controller?.abort();
  });
  return { status, retrying, retry };
}
