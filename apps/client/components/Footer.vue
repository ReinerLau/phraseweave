<template>
  <footer
    :class="[
      'flex w-full shrink-0 flex-col text-xs opacity-65',
      compact
        ? 'h-6 items-start justify-center px-0 text-left'
        : 'h-12 items-center justify-center px-4 text-center',
    ]"
  >
    <p class="w-full min-w-0 max-w-full whitespace-normal">v{{ appVersion }}</p>
  </footer>
</template>

<script setup lang="ts">
import { useRuntimeConfig } from "nuxt/app";

withDefaults(defineProps<{ compact?: boolean }>(), {
  compact: false,
});

const appVersion = useRuntimeConfig().public.appVersion;
</script>
