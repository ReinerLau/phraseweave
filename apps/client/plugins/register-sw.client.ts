import { defineNuxtPlugin, useRuntimeConfig } from "nuxt/app";

export default defineNuxtPlugin(() => {
  if (!("serviceWorker" in navigator)) return;

  const runtimeConfig = useRuntimeConfig();
  const baseURL = runtimeConfig.app.baseURL;
  const shouldDisableServiceWorker =
    import.meta.dev || runtimeConfig.public.deploymentEnvironment === "preview";

  if (shouldDisableServiceWorker) {
    const expectedScope = new URL(baseURL, window.location.origin).href;
    void navigator.serviceWorker
      .getRegistrations()
      .then((registrations) =>
        Promise.all(
          registrations
            .filter((registration) => registration.scope === expectedScope)
            .map((registration) => registration.unregister()),
        ),
      );
    return;
  }

  void navigator.serviceWorker.register(`${baseURL}sw.js`, { scope: baseURL });
});
