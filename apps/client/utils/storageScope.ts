const PREVIEW_PATH_SEGMENT = "preview";
const PREVIEW_STORAGE_PREFIX = "preview:";

function currentPathname() {
  return typeof window === "undefined" ? "/" : window.location.pathname;
}

export function isPreviewPath(pathname = currentPathname()) {
  return pathname.split("/").includes(PREVIEW_PATH_SEGMENT);
}

export function scopedStorageName(name: string, pathname = currentPathname()) {
  return isPreviewPath(pathname) ? `${PREVIEW_STORAGE_PREFIX}${name}` : name;
}

export function getLocalStorageItem(key: string) {
  return localStorage.getItem(scopedStorageName(key));
}

export function setLocalStorageItem(key: string, value: string) {
  localStorage.setItem(scopedStorageName(key), value);
}

export function removeLocalStorageItem(key: string) {
  localStorage.removeItem(scopedStorageName(key));
}

export function getSessionStorageItem(key: string) {
  return sessionStorage.getItem(scopedStorageName(key));
}

export function setSessionStorageItem(key: string, value: string) {
  sessionStorage.setItem(scopedStorageName(key), value);
}

export function removeSessionStorageItem(key: string) {
  sessionStorage.removeItem(scopedStorageName(key));
}
