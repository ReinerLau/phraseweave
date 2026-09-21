import { defineNuxtPlugin, useRuntimeConfig } from "nuxt/app";

import { getServiceWorkerRegistration } from "~/utils/serviceWorker";

export default defineNuxtPlugin(() => {
  if (!("serviceWorker" in navigator)) return;

  if (import.meta.dev) {
    void navigator.serviceWorker
      .getRegistrations()
      .then((registrations) =>
        Promise.all(registrations.map((registration) => registration.unregister())),
      );
    return;
  }

  const { scriptUrl, scope } = getServiceWorkerRegistration(useRuntimeConfig().app.baseURL || "/");
  void navigator.serviceWorker.register(scriptUrl, { scope });
});
