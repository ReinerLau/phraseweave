import { defineNuxtPlugin, useRuntimeConfig } from "nuxt/app";

export default defineNuxtPlugin(() => {
  if (!("serviceWorker" in navigator)) return;

  const runtimeConfig = useRuntimeConfig();
  const baseURL = runtimeConfig.app.baseURL;
  const shouldDisableServiceWorker =
    import.meta.dev || runtimeConfig.public.deploymentEnvironment === "preview";

  if (shouldDisableServiceWorker) {
    const currentUrl = window.location.href;
    void navigator.serviceWorker
      .getRegistrations()
      .then((registrations) =>
        Promise.all(
          registrations
            .filter((registration) => currentUrl.startsWith(registration.scope))
            .map((registration) => registration.unregister()),
        ),
      );
    return;
  }

  void navigator.serviceWorker.register(`${baseURL}sw.js`, { scope: baseURL });
});
