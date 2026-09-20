import { useLogto } from "@logto/vue";
import { useRuntimeConfig } from "nuxt/app";

import {
  getSessionStorageItem,
  removeSessionStorageItem,
  setSessionStorageItem,
} from "~/utils/storageScope";

let logto: ReturnType<typeof useLogto> | undefined;
let runtimeConfig: ReturnType<typeof useRuntimeConfig> | undefined;
export async function setupAuth() {
  logto = useLogto();
  runtimeConfig = useRuntimeConfig();
}

export function isAuthEnabled() {
  return Boolean(runtimeConfig?.public.endpoint && runtimeConfig.public.appId && logto);
}

export async function signIn(callback?: string) {
  callback && setSignInCallback(callback);
  if (isAuthEnabled() && logto && runtimeConfig) {
    logto.signIn(runtimeConfig.public.signInRedirectURI);
  }
}

export function signOut() {
  if (isAuthEnabled() && logto && runtimeConfig) {
    return logto.signOut(runtimeConfig.public.signOutRedirectURI);
  }
}

export function isAuthenticated() {
  return isAuthEnabled() && logto!.isAuthenticated.value;
}

export async function getToken() {
  if (!isAuthEnabled()) return undefined;

  const accessToken = await logto!.getAccessToken(runtimeConfig!.public.backendEndpoint);

  return accessToken;
}

export function getSignInCallback() {
  let callback = getSessionStorageItem("callback");
  if (callback) {
    removeSessionStorageItem("callback");
    return callback;
  } else {
    return "/";
  }
}

function setSignInCallback(callback: string) {
  setSessionStorageItem("callback", callback);
}
