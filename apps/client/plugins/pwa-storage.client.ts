import { defineNuxtPlugin } from "nuxt/app";

export default defineNuxtPlugin(async () => {
  if (!navigator.storage?.persisted) return;

  if (!(await navigator.storage.persisted()) && navigator.storage.persist) {
    await navigator.storage.persist();
  }
});
