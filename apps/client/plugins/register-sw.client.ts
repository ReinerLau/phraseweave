import { defineNuxtPlugin, useRuntimeConfig } from "nuxt/app";

export default defineNuxtPlugin(() => {
  if (!("serviceWorker" in navigator)) return;

  const runtimeConfig = useRuntimeConfig();
  const baseURL = runtimeConfig.app.baseURL;
  if (import.meta.dev) {
    void navigator.serviceWorker
      .getRegistrations()
      .then((registrations) =>
        Promise.all(registrations.map((registration) => registration.unregister())),
      );
    return;
  }

  if (runtimeConfig.public.deploymentEnvironment === "preview") return;

  void navigator.serviceWorker.register(`${baseURL}sw.js`, { scope: baseURL });
});
