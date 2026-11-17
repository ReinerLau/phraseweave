import { handleRemoteAuth } from "~/services/remoteSession";

const SERVICE_URL = "http://127.0.0.1:8765";
type LocalFetchInit = RequestInit & { targetAddressSpace?: "loopback" };

export function isLocalPackage() {
  return (
    typeof document !== "undefined" &&
    document.querySelector('meta[name="phraseweave-runtime"]')?.getAttribute("content") ===
      "local-package"
  );
}

export async function localServiceFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const packagePage = isLocalPackage();
  const options: LocalFetchInit = packagePage
    ? { ...init }
    : { ...init, targetAddressSpace: "loopback" };
  const response = await fetch(
    `${packagePage ? window.location.origin : SERVICE_URL}${path}`,
    options,
  );
  await handleRemoteAuth(response);
  return response;
}

export async function localRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await localServiceFetch(path, init);
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || `本地服务返回错误（${response.status}）。`);
  return body as T;
}
