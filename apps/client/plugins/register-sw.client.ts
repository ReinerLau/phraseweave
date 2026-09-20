import { defineNuxtPlugin } from "nuxt/app";

export default defineNuxtPlugin(() => {
  if ("serviceWorker" in navigator) {
    void navigator.serviceWorker.register("./sw.js", { scope: "./" });
  }
});
