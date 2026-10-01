import { ref } from "vue";

import typingSoundPath from "~/assets/sounds/typing.mp3";

const PLAY_INTERVAL_MS = 60;
let audioContext: AudioContext | undefined;
let audioBuffer: AudioBuffer | undefined;
let audioBufferPromise: Promise<AudioBuffer | undefined> | undefined;

export function useTypingSound() {
  const lastPlayTime = ref(0);

  async function playTypingSound() {
    const now = Date.now();
    if (now - lastPlayTime.value < PLAY_INTERVAL_MS) return;
    lastPlayTime.value = now;

    const bufferPromise = loadAudioBuffer();
    const context = audioContext;
    if (!context) return;

    // Request resume synchronously from the key event so browser autoplay
    // policies recognize the user's gesture while the sound file loads.
    const resumePromise =
      context.state === "suspended" ? context.resume().catch(() => undefined) : Promise.resolve();
    const buffer = await bufferPromise;
    await resumePromise;
    if (!buffer) return;

    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(context.destination);
    source.onended = () => source.disconnect();
    source.start();
  }

  function checkPlayTypingSound(event: KeyboardEvent) {
    if (event.altKey || event.ctrlKey || event.metaKey) return false;

    return /^[a-zA-Z0-9]$/.test(event.key) || ["Backspace", " ", "'"].includes(event.key);
  }

  return { playTypingSound, checkPlayTypingSound };
}

async function loadAudioBuffer() {
  if (typeof AudioContext === "undefined") return undefined;
  audioContext ??= new AudioContext();
  if (audioBuffer) return audioBuffer;

  audioBufferPromise ??= fetch(typingSoundPath)
    .then((response) => {
      if (!response.ok) throw new Error("Typing sound could not be loaded.");
      return response.arrayBuffer();
    })
    .then((data) => audioContext!.decodeAudioData(data))
    .then((buffer) => {
      audioBuffer = buffer;
      return buffer;
    })
    .catch(() => {
      audioBufferPromise = undefined;
      return undefined;
    });

  return audioBufferPromise;
}
