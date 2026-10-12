import { ref, shallowRef } from "vue";

import { deleteWordAudioCache, fetchWordAudio, isSpeakableWord } from "~/services/wordAudio";

const loadingElement = shallowRef<HTMLElement>();
const audioError = ref("");
let player: HTMLAudioElement | undefined;
let controller: AbortController | undefined;
let objectUrl: string | undefined;
let sequence = 0;

// Unlock the same media element during the tap, before awaiting the network.
const SILENCE =
  "data:audio/wav;base64,UklGRiUAAABXQVZFZm10IBAAAAABAAEARKwAAESsAAABAAgAZGF0YQEAAACA";

export function stopWordAudio() {
  sequence++;
  controller?.abort();
  controller = undefined;
  loadingElement.value = undefined;
  if (player) {
    player.onended = null;
    player.onerror = null;
    player.pause();
    player.removeAttribute("src");
    player.load();
  }
  if (objectUrl) URL.revokeObjectURL(objectUrl);
  objectUrl = undefined;
  audioError.value = "";
}

export function disposeWordAudio() {
  stopWordAudio();
  player = undefined;
}

export async function playWordAudio(text: string, element: HTMLElement) {
  if (!isSpeakableWord(text)) return;
  stopWordAudio();
  const request = sequence;
  const abort = new AbortController();
  controller = abort;
  loadingElement.value = element;
  try {
    player ??= new Audio();
    player.src = SILENCE;
    void player.play().catch(() => {});
    const blob = await fetchWordAudio(text, abort.signal);
    if (request !== sequence) return;
    objectUrl = URL.createObjectURL(blob);
    player.src = objectUrl;
    player.onended = () => {
      if (request === sequence) stopWordAudio();
    };
    player.onerror = () => {
      if (request !== sequence) return;
      stopWordAudio();
      audioError.value = "音频播放失败，请再次点击单词。";
    };
    await player.play();
    if (request === sequence) loadingElement.value = undefined;
  } catch (error) {
    if (request !== sequence) return;
    stopWordAudio();
    audioError.value = error instanceof Error ? error.message : "朗读失败，请再次点击单词。";
  }
}

export async function clearWordAudioCache() {
  stopWordAudio();
  await deleteWordAudioCache();
}

/** Resolve a visible, playable word beneath the transparent typing input. */
export function findWordUnderInput(
  point: Pick<MouseEvent, "clientX" | "clientY">,
  root: HTMLElement,
) {
  const element = document
    .elementsFromPoint(point.clientX, point.clientY)
    .find((candidate) => root.contains(candidate) && candidate.hasAttribute("data-speech-text"));
  return element instanceof HTMLElement && isSpeakableWord(element.dataset.speechText ?? "")
    ? element
    : undefined;
}

/** Hit-test beneath the transparent typing input without moving its caret. */
export function playWordUnderInput(event: MouseEvent, root: HTMLElement) {
  const element = findWordUnderInput(event, root);
  if (element) {
    void playWordAudio(element.dataset.speechText ?? "", element);
  }
}

export function useWordAudio() {
  return {
    loadingElement,
    audioError,
    playWordAudio,
    stopWordAudio,
    disposeWordAudio,
    clearWordAudioCache,
  };
}
