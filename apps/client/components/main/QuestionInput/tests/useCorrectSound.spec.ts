import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import rightSoundPath from "~/assets/sounds/right.mp3";

describe("correct feedback sound", () => {
  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function mockContext(state = "running") {
    const createSource = () => ({
      buffer: null as AudioBuffer | null,
      connect: vi.fn(),
      disconnect: vi.fn(),
      start: vi.fn(),
      onended: () => {},
    });
    const buffer = {} as AudioBuffer;
    const data = new ArrayBuffer(8);
    const context = {
      state,
      destination: {},
      resume: vi.fn().mockResolvedValue(undefined),
      decodeAudioData: vi.fn().mockResolvedValue(buffer),
      createBufferSource: vi.fn(createSource),
    };
    const fetchSound = vi.fn().mockResolvedValue({ ok: true, arrayBuffer: async () => data });
    const construct = vi.fn(() => context);
    vi.stubGlobal("AudioContext", construct);
    vi.stubGlobal("fetch", fetchSound);
    return { context, construct, buffer, data, fetchSound };
  }

  it("plays the original MP3 in full and reuses its decoded buffer for later confirmations", async () => {
    const { context, construct, buffer, data, fetchSound } = mockContext();
    const { useCorrectSound } = await import("../useCorrectSound");
    await useCorrectSound().playCorrectSound();
    expect(fetchSound).toHaveBeenCalledWith(rightSoundPath);
    expect(context.decodeAudioData).toHaveBeenCalledWith(data);
    const source = context.createBufferSource.mock.results[0].value;
    expect(source.buffer).toBe(buffer);
    expect(source.connect).toHaveBeenCalledWith(context.destination);
    expect(source.start).toHaveBeenCalledOnce();
    expect(source.start).toHaveBeenCalledWith();
    source.onended();
    expect(source.disconnect).toHaveBeenCalledOnce();
    await useCorrectSound().playCorrectSound();
    expect(construct).toHaveBeenCalledOnce();
    expect(fetchSound).toHaveBeenCalledOnce();
    expect(context.decodeAudioData).toHaveBeenCalledOnce();
    expect(context.createBufferSource).toHaveBeenCalledTimes(2);
  });

  it("requests resume immediately while the MP3 is still loading", async () => {
    const { context, fetchSound } = mockContext("suspended");
    let resolveResponse!: (response: unknown) => void;
    fetchSound.mockReturnValue(
      new Promise((resolve) => {
        resolveResponse = resolve;
      }),
    );
    const { useCorrectSound } = await import("../useCorrectSound");
    const playing = useCorrectSound().playCorrectSound();
    expect(context.resume).toHaveBeenCalledOnce();
    expect(context.createBufferSource).not.toHaveBeenCalled();
    resolveResponse({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) });
    await playing;
    expect(context.createBufferSource).toHaveBeenCalledOnce();
  });

  it("retries a failed MP3 fetch or decode on the next confirmation", async () => {
    const { context, fetchSound, buffer } = mockContext();
    fetchSound.mockResolvedValueOnce({ ok: false });
    const { useCorrectSound } = await import("../useCorrectSound");
    await expect(useCorrectSound().playCorrectSound()).resolves.toBeUndefined();
    expect(context.createBufferSource).not.toHaveBeenCalled();
    context.decodeAudioData.mockRejectedValueOnce(new Error("invalid audio"));
    await expect(useCorrectSound().playCorrectSound()).resolves.toBeUndefined();
    expect(context.createBufferSource).not.toHaveBeenCalled();
    await useCorrectSound().playCorrectSound();
    expect(fetchSound).toHaveBeenCalledTimes(3);
    expect(context.createBufferSource.mock.results[0].value.buffer).toBe(buffer);
  });

  it("ignores unavailable audio, failed resume, and node failures", async () => {
    vi.stubGlobal("AudioContext", undefined);
    const { useCorrectSound } = await import("../useCorrectSound");
    await expect(useCorrectSound().playCorrectSound()).resolves.toBeUndefined();
    const { context } = mockContext("suspended");
    context.resume.mockRejectedValue(new Error("blocked"));
    await expect(useCorrectSound().playCorrectSound()).resolves.toBeUndefined();
    expect(context.createBufferSource).not.toHaveBeenCalled();
    context.state = "running";
    context.createBufferSource.mockImplementation(() => {
      throw new Error("audio failed");
    });
    await expect(useCorrectSound().playCorrectSound()).resolves.toBeUndefined();
  });
});
