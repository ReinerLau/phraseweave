import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("correct feedback sound", () => {
  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function mockContext(state = "running") {
    const oscillator = {
      type: "",
      frequency: { setValueAtTime: vi.fn() },
      connect: vi.fn(),
      disconnect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
      onended: () => {},
    };
    const gain = {
      gain: { setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() },
      connect: vi.fn(),
      disconnect: vi.fn(),
    };
    const context = {
      state,
      currentTime: 5,
      destination: {},
      resume: vi.fn().mockResolvedValue(undefined),
      createOscillator: vi.fn(() => oscillator),
      createGain: vi.fn(() => gain),
    };
    const construct = vi.fn(() => context);
    vi.stubGlobal("AudioContext", construct);
    return { context, construct, oscillator, gain };
  }

  it("plays a short rising tone and disconnects its nodes", async () => {
    const { context, construct, oscillator, gain } = mockContext();
    const { useCorrectSound } = await import("../useCorrectSound");
    await useCorrectSound().playCorrectSound();
    expect(oscillator.frequency.setValueAtTime.mock.calls).toEqual([
      [660, 5],
      [880, 5.06],
    ]);
    expect(oscillator.start).toHaveBeenCalledWith(5);
    expect(oscillator.stop).toHaveBeenCalledWith(5.16);
    oscillator.onended();
    expect(oscillator.disconnect).toHaveBeenCalledOnce();
    expect(gain.disconnect).toHaveBeenCalledOnce();
    await useCorrectSound().playCorrectSound();
    expect(construct).toHaveBeenCalledOnce();
    expect(context.createOscillator).toHaveBeenCalledTimes(2);
  });

  it("requests resume immediately from the confirming gesture", async () => {
    const { context } = mockContext("suspended");
    const { useCorrectSound } = await import("../useCorrectSound");
    const playing = useCorrectSound().playCorrectSound();
    expect(context.resume).toHaveBeenCalledOnce();
    await playing;
    expect(context.createOscillator).toHaveBeenCalledOnce();
  });

  it("ignores unavailable audio, failed resume, and node failures", async () => {
    vi.stubGlobal("AudioContext", undefined);
    const { useCorrectSound } = await import("../useCorrectSound");
    await expect(useCorrectSound().playCorrectSound()).resolves.toBeUndefined();
    const { context } = mockContext("suspended");
    context.resume.mockRejectedValue(new Error("blocked"));
    await expect(useCorrectSound().playCorrectSound()).resolves.toBeUndefined();
    context.state = "running";
    context.createOscillator.mockImplementation(() => {
      throw new Error("audio failed");
    });
    await expect(useCorrectSound().playCorrectSound()).resolves.toBeUndefined();
  });
});
