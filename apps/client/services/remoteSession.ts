import { ref } from "vue";

export const remoteUsername = ref<string>();

export function remoteLoginPath(returnTo: string) {
  return `/remote/login?returnTo=${encodeURIComponent(returnTo)}`;
}

function isRemotePackage() {
  return (
    typeof window !== "undefined" &&
    window.location.protocol === "https:" &&
    document.querySelector('meta[name="phraseweave-runtime"]')?.getAttribute("content") ===
      "local-package"
  );
}

export async function handleRemoteAuth(response: Response) {
  if (!isRemotePackage() || response.status !== 401) return;
  const body = await response
    .clone()
    .json()
    .catch(() => undefined);
  if (body?.code !== "REMOTE_AUTH_REQUIRED") return;
  remoteUsername.value = undefined;
  const { pathname, search, hash } = window.location;
  window.location.assign(remoteLoginPath(`${pathname}${search}${hash}`));
  throw new Error("登录已过期，请重新登录。");
}

export async function loadRemoteSession() {
  if (!isRemotePackage()) return;
  try {
    const response = await fetch("/remote/session", { cache: "no-store" });
    await handleRemoteAuth(response);
    if (!response.ok) return;
    const body = await response.json();
    if (typeof body.username === "string") remoteUsername.value = body.username;
  } catch {
    // Access mode has no local password session endpoint; keep its existing UI.
  }
}
