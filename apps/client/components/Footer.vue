<template>
  <footer
    class="flex h-12 w-full shrink-0 flex-col items-center justify-center px-4 text-center text-xs opacity-65"
  >
    <p class="w-full min-w-0 max-w-full whitespace-normal">v{{ appVersion }}</p>
  </footer>
</template>

<script setup lang="ts">
import { useRuntimeConfig } from "nuxt/app";

const appVersion = useRuntimeConfig().public.appVersion;
</script>
