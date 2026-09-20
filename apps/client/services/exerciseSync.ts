import { useRuntimeConfig } from "nuxt/app";

import type { ExerciseResponse } from "~/api/exercise";
import { isValidExerciseSyncRoomToken } from "~/utils/exerciseSyncQr";

export type SyncRole = "sender" | "receiver";
export type SyncStatus = "connecting" | "waiting" | "connected" | "syncing" | "completed" | "error";

export interface SyncUpdate {
  status: SyncStatus;
  progress?: number;
  message?: string;
}

interface SignalMessage {
  type: "join" | "peer-ready" | "signal" | "error";
  role?: SyncRole;
  data?: RTCSessionDescriptionInit | RTCIceCandidateInit;
  message?: string;
}

interface PackageMetadata {
  type: "package-meta";
  size: number;
  chunks: number;
  checksum: string;
}

const CHUNK_SIZE = 16 * 1024;
const RECEIVER_CONNECTION_TIMEOUT_MS = 30_000;

export function createRoomToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function isValidRoomToken(roomToken: string) {
  return isValidExerciseSyncRoomToken(roomToken);
}

export function createExerciseSyncUrl(roomToken: string) {
  const config = useRuntimeConfig();
  const baseURL = config.app.baseURL || "/";
  const path = `${baseURL.replace(/\/$/, "")}/receive`;
  const url = new URL(path, window.location.origin);
  url.searchParams.set("room", roomToken);
  return url.toString();
}

export function getSignalUrl(roomToken: string) {
  const configuredUrl = String(useRuntimeConfig().public.exerciseSyncSignalUrl || "");
  if (!configuredUrl) {
    throw new Error("未配置练习同步服务");
  }

  const url = new URL(configuredUrl, window.location.origin);
  const signalPath = url.pathname.replace(/\/$/, "") || "/room";
  url.pathname = `${signalPath}/${roomToken}`;
  return url.toString().replace(/^http/, "ws");
}

export async function createSenderSession(
  roomToken: string,
  coursePack: ExerciseResponse,
  onUpdate: (update: SyncUpdate) => void,
) {
  return createSession("sender", roomToken, onUpdate, async (channel) => {
    const payload = new TextEncoder().encode(JSON.stringify(coursePack));
    const checksum = await digest(payload);
    const chunks = Math.ceil(payload.byteLength / CHUNK_SIZE);

    channel.send(
      JSON.stringify({
        type: "package-meta",
        size: payload.byteLength,
        chunks,
        checksum,
      } satisfies PackageMetadata),
    );

    for (let index = 0; index < chunks; index += 1) {
      channel.send(payload.slice(index * CHUNK_SIZE, (index + 1) * CHUNK_SIZE));
      onUpdate({
        status: "syncing",
        progress: Math.round(((index + 1) / chunks) * 100),
        message: `正在同步练习 ${index + 1}/${chunks}`,
      });
      await waitForBufferedAmount(channel);
    }
    await waitForBufferedAmount(channel, 0);
  });
}

export async function createReceiverSession(
  roomToken: string,
  onUpdate: (update: SyncUpdate) => void,
  onCoursePack: (coursePack: ExerciseResponse) => Promise<void>,
) {
  let metadata: PackageMetadata | undefined;
  const chunks: ArrayBuffer[] = [];

  return createSession("receiver", roomToken, onUpdate, undefined, {
    onMessage: async (event) => {
      if (typeof event.data === "string") {
        const parsed = JSON.parse(event.data) as PackageMetadata;
        if (parsed.type === "package-meta") {
          metadata = parsed;
          onUpdate({ status: "syncing", progress: 0, message: "正在同步练习" });
        }
        return false;
      }

      if (!metadata) return false;
      chunks.push(event.data instanceof Blob ? await event.data.arrayBuffer() : event.data);
      const progress = Math.min(
        100,
        Math.round(
          (chunks.reduce((total, item) => total + item.byteLength, 0) / metadata.size) * 100,
        ),
      );
      onUpdate({ status: "syncing", progress, message: `正在同步练习 ${progress}%` });

      if (chunks.length !== metadata.chunks) return false;

      const payload = mergeBuffers(chunks, metadata.size);
      if ((await digest(payload)) !== metadata.checksum) {
        throw new Error("练习同步校验失败");
      }

      const coursePack = JSON.parse(new TextDecoder().decode(payload)) as ExerciseResponse;
      await onCoursePack(coursePack);
      onUpdate({ status: "completed", progress: 100, message: "练习已保存到本机" });
      return true;
    },
  });
}

async function createSession(
  role: SyncRole,
  roomToken: string,
  onUpdate: (update: SyncUpdate) => void,
  onChannelOpen?: (channel: RTCDataChannel) => Promise<void>,
  receiver?: { onMessage: (event: MessageEvent) => Promise<boolean> },
) {
  if (!isValidRoomToken(roomToken)) throw new Error("无效的练习同步二维码");

  const socket = new WebSocket(getSignalUrl(roomToken));
  const peer = new RTCPeerConnection();
  let channel: RTCDataChannel | undefined;
  let closed = false;
  let connectionTimeout: ReturnType<typeof setTimeout> | undefined;

  const clearConnectionTimeout = () => {
    if (connectionTimeout) clearTimeout(connectionTimeout);
    connectionTimeout = undefined;
  };

  const close = () => {
    if (closed) return;
    closed = true;
    clearConnectionTimeout();
    peer.close();
    socket.close();
  };

  peer.onicecandidate = (event) => {
    if (event.candidate && socket.readyState === WebSocket.OPEN) {
      sendSignal(socket, event.candidate.toJSON());
    }
  };

  if (role === "sender") {
    channel = peer.createDataChannel("course-pack");
    channel.binaryType = "arraybuffer";
    channel.onopen = () => {
      onUpdate({ status: "connected", progress: 0, message: "已连接手机" });
      if (onChannelOpen) {
        void onChannelOpen(channel!)
          .then(() => {
            onUpdate({ status: "completed", progress: 100, message: "课程已发送到手机" });
            close();
          })
          .catch((error) => {
            onUpdate({
              status: "error",
              message: error instanceof Error ? error.message : "课程发送失败",
            });
            close();
          });
      }
    };
  } else {
    peer.ondatachannel = (event) => {
      clearConnectionTimeout();
      channel = event.channel;
      channel.binaryType = "arraybuffer";
      channel.onclose = () => {
        if (closed) return;
        onUpdate({
          status: "error",
          message: "练习同步连接已断开，请重新生成同步链接",
        });
        close();
      };
      channel.onmessage = (message) => {
        if (!receiver) return;
        void receiver
          .onMessage(message)
          .then((completed) => {
            if (completed) close();
          })
          .catch((error) => {
            onUpdate({
              status: "error",
              message: error instanceof Error ? error.message : "课程接收失败",
            });
            close();
          });
      };
    };
  }

  socket.onopen = () => {
    sendSocket(socket, { type: "join", role });
    onUpdate({ status: "waiting", message: "等待另一台设备连接" });
    if (role === "receiver") {
      connectionTimeout = setTimeout(() => {
        if (closed) return;
        onUpdate({
          status: "error",
          message: "同步链接已失效，请让电脑端重新生成同步链接",
        });
        close();
      }, RECEIVER_CONNECTION_TIMEOUT_MS);
    }
  };

  const pendingCandidates: RTCIceCandidateInit[] = [];

  socket.onmessage = async (event) => {
    try {
      const message = JSON.parse(event.data) as SignalMessage;

      if (message.type === "error") throw new Error(formatSignalError(message.message));

      if (message.type === "peer-ready" && role === "sender") {
        const offer = await peer.createOffer();
        await peer.setLocalDescription(offer);
        sendSignal(socket, offer);
        return;
      }

      if (message.type !== "signal" || !message.data) return;

      if (isIceCandidate(message.data)) {
        if (peer.remoteDescription) {
          await peer.addIceCandidate(message.data);
        } else {
          pendingCandidates.push(message.data);
        }
      } else if (
        isSessionDescription(message.data) &&
        role === "receiver" &&
        message.data.type === "offer"
      ) {
        await peer.setRemoteDescription(message.data);
        await flushCandidates(peer, pendingCandidates);
        const answer = await peer.createAnswer();
        await peer.setLocalDescription(answer);
        sendSignal(socket, answer);
      } else if (
        isSessionDescription(message.data) &&
        role === "sender" &&
        message.data.type === "answer"
      ) {
        await peer.setRemoteDescription(message.data);
        await flushCandidates(peer, pendingCandidates);
      }
    } catch (error) {
      onUpdate({
        status: "error",
        message: error instanceof Error ? error.message : "信令协商失败",
      });
      close();
    }
  };

  socket.onerror = () => {
    onUpdate({ status: "error", message: "无法连接练习同步服务" });
    close();
  };
  socket.onclose = () => {
    if (!closed) {
      clearConnectionTimeout();
      onUpdate({ status: "error", message: "练习同步连接已断开，请重新生成同步链接" });
    }
  };

  return { close };
}

function formatSignalError(message?: string) {
  if (message === "This transfer role is already occupied") {
    return "这条同步链接已被使用，请从电脑端重新生成同步链接";
  }
  return message || "练习同步服务返回错误";
}

function isIceCandidate(
  data: RTCSessionDescriptionInit | RTCIceCandidateInit,
): data is RTCIceCandidateInit {
  return "candidate" in data;
}

function isSessionDescription(
  data: RTCSessionDescriptionInit | RTCIceCandidateInit,
): data is RTCSessionDescriptionInit {
  return "type" in data && "sdp" in data;
}

async function flushCandidates(peer: RTCPeerConnection, candidates: RTCIceCandidateInit[]) {
  for (const candidate of candidates.splice(0)) {
    await peer.addIceCandidate(candidate);
  }
}

function sendSignal(socket: WebSocket, data: RTCSessionDescriptionInit | RTCIceCandidateInit) {
  sendSocket(socket, { type: "signal", data });
}

function sendSocket(socket: WebSocket, message: SignalMessage) {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
}

async function waitForBufferedAmount(channel: RTCDataChannel, maxBufferedAmount = CHUNK_SIZE * 4) {
  while (channel.bufferedAmount > maxBufferedAmount) {
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

async function digest(data: ArrayBuffer | Uint8Array) {
  const buffer = data instanceof Uint8Array ? data : new Uint8Array(data);
  const hash = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function mergeBuffers(buffers: ArrayBuffer[], size: number) {
  const result = new Uint8Array(size);
  let offset = 0;
  buffers.forEach((buffer) => {
    result.set(new Uint8Array(buffer), offset);
    offset += buffer.byteLength;
  });
  return result;
}
