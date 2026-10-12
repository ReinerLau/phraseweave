import rightSoundPath from "~/assets/sounds/right.mp3";

let audioContext: AudioContext | undefined;
let audioBuffer: AudioBuffer | undefined;
let audioBufferPromise: Promise<AudioBuffer | undefined> | undefined;

export function useCorrectSound() {
  async function playCorrectSound() {
    try {
      if (typeof AudioContext === "undefined") return;
      if (!audioContext || audioContext.state === "closed") audioContext = new AudioContext();
      const context = audioContext;
      // Request resume during the confirming gesture, before the MP3 loads.
      const resumePromise = context.state === "suspended" ? context.resume() : Promise.resolve();
      const [buffer] = await Promise.all([loadAudioBuffer(context), resumePromise]);
      if (!buffer) return;

      const source = context.createBufferSource();
      source.buffer = buffer;
      source.connect(context.destination);
      source.onended = () => source.disconnect();
      source.start();
    } catch {
      // Feedback audio must never interrupt answering, including on resume failure.
    }
  }

  return { playCorrectSound };
}

async function loadAudioBuffer(context: AudioContext) {
  if (audioBuffer) return audioBuffer;
  audioBufferPromise ??= fetch(rightSoundPath)
    .then((response) => {
      if (!response.ok) throw new Error("Correct sound could not be loaded.");
      return response.arrayBuffer();
    })
    .then((data) => context.decodeAudioData(data))
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
