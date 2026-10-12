import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { deleteWordAudioCache, fetchSentenceAudio, fetchWordAudio } from "~/services/wordAudio";

describe("word audio service", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    document
      .querySelectorAll('meta[name="phraseweave-runtime"]')
      .forEach((marker) => marker.remove());
  });

  function packageMarker() {
    const marker = document.createElement("meta");
    marker.name = "phraseweave-runtime";
    marker.content = "local-package";
    document.head.append(marker);
  }

  it("uses the package origin and preserves audio bytes", async () => {
    packageMarker();
    const bytes = new Uint8Array([255, 251, 0, 128]);
    fetchMock.mockResolvedValue(new Response(bytes, { headers: { "Content-Type": "audio/mpeg" } }));
    const signal = new AbortController().signal;
    const audio = await fetchWordAudio("NASA", signal);
    expect(new Uint8Array(await audio.arrayBuffer())).toEqual(bytes);
    expect(fetchMock).toHaveBeenCalledWith(
      `${window.location.origin}/api/tts`,
      expect.objectContaining({
        method: "POST",
        body: '{"text":"NASA"}',
        signal,
      }),
    );
  });

  it("requests a whole sentence without dropping punctuation or the target word", async () => {
    fetchMock.mockResolvedValue(
      new Response("audio", { headers: { "Content-Type": "audio/mpeg" } }),
    );
    const signal = new AbortController().signal;
    await fetchSentenceAudio("I use a computer every day.", signal);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:8765/api/tts",
      expect.objectContaining({
        body: JSON.stringify({ text: "I use a computer every day.", kind: "sentence" }),
        signal,
      }),
    );
  });

  it("uses the loopback service for a non-package page", async () => {
    fetchMock.mockResolvedValue(
      new Response("audio", { headers: { "Content-Type": "audio/mpeg" } }),
    );
    await fetchWordAudio("hello", new AbortController().signal);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:8765/api/tts",
      expect.objectContaining({ targetAddressSpace: "loopback" }),
    );
  });

  it("surfaces server errors and rejects missing or invalid audio", async () => {
    fetchMock.mockResolvedValueOnce(new Response('{"error":"超时"}', { status: 503 }));
    await expect(fetchWordAudio("hello", new AbortController().signal)).rejects.toThrow("超时");
    fetchMock.mockResolvedValueOnce(new Response("<html>Login</html>"));
    await expect(fetchWordAudio("hello", new AbortController().signal)).rejects.toThrow("音频");
    fetchMock.mockResolvedValueOnce(
      new Response("", { headers: { "Content-Type": "audio/mpeg" } }),
    );
    await expect(fetchWordAudio("hello", new AbortController().signal)).rejects.toThrow("音频");
  });

  it("redirects expired remote sessions before treating the result as audio", async () => {
    packageMarker();
    const assign = vi.fn();
    vi.stubGlobal("window", {
      location: {
        origin: "https://tts.example.com",
        protocol: "https:",
        pathname: "/game/pack/course",
        search: "",
        hash: "",
        assign,
      },
    });
    fetchMock.mockResolvedValue(new Response('{"code":"REMOTE_AUTH_REQUIRED"}', { status: 401 }));
    await expect(fetchWordAudio("hello", new AbortController().signal)).rejects.toThrow();
    expect(assign).toHaveBeenCalledWith("/remote/login?returnTo=%2Fgame%2Fpack%2Fcourse");
  });

  it("offers an actionable connection failure and sends cache deletion", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await expect(fetchWordAudio("hello", new AbortController().signal)).rejects.toThrow(
      "启动本机服务",
    );
    packageMarker();
    fetchMock.mockResolvedValue(new Response('{"ok":true}'));
    await deleteWordAudioCache();
    expect(fetchMock).toHaveBeenLastCalledWith(`${window.location.origin}/api/tts/cache`, {
      method: "DELETE",
    });
  });
});
