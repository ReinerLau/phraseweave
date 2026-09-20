import { defineNuxtPlugin } from "nuxt/app";

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

  void navigator.serviceWorker.register("/sw.js", { scope: "/" });
});
