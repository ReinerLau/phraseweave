export interface ExerciseSyncQrPayload {
  roomToken: string;
}

const ROOM_TOKEN_PATTERN = /^[a-f0-9]{64}$/;

export function isValidExerciseSyncRoomToken(roomToken: string) {
  return ROOM_TOKEN_PATTERN.test(roomToken);
}

export function parseExerciseSyncQr(
  raw: string,
  currentOrigin: string,
): ExerciseSyncQrPayload | undefined {
  try {
    const url = new URL(raw);
    const origin = new URL(currentOrigin).origin;
    const path = url.pathname.replace(/\/+$/, "");

    if (url.origin !== origin || !path.endsWith("/receive")) return undefined;

    const roomToken = url.searchParams.get("room") || "";
    if (!isValidExerciseSyncRoomToken(roomToken)) return undefined;

    return { roomToken };
  } catch {
    return undefined;
  }
}
