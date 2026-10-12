let audioContext: AudioContext | undefined;

export function useCorrectSound() {
  async function playCorrectSound() {
    try {
      if (typeof AudioContext === "undefined") return;
      if (!audioContext || audioContext.state === "closed") audioContext = new AudioContext();
      const context = audioContext;
      // Resume from the confirming key event to satisfy browser autoplay policy.
      if (context.state === "suspended") await context.resume();

      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const start = context.currentTime;
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(660, start);
      oscillator.frequency.setValueAtTime(880, start + 0.06);
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.12, start + 0.01);
      gain.gain.linearRampToValueAtTime(0, start + 0.16);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.onended = () => {
        oscillator.disconnect();
        gain.disconnect();
      };
      oscillator.start(start);
      oscillator.stop(start + 0.16);
    } catch {
      // Feedback audio must never interrupt answering, including on resume failure.
    }
  }

  return { playCorrectSound };
}
