<template>
  <aside
    v-if="isPreview"
    data-testid="preview-banner"
    class="w-full bg-amber-300 px-4 py-2 text-center text-sm font-semibold text-amber-950"
  >
    测试环境 · {{ shortSha }}<span v-if="buildTime"> · {{ buildTime }}</span>
  </aside>
</template>

<script setup lang="ts">
import { useRuntimeConfig } from "nuxt/app";
import { computed } from "vue";

const runtimeConfig = useRuntimeConfig();
const isPreview = computed(() => runtimeConfig.public.deploymentEnvironment === "preview");
const shortSha = computed(() => runtimeConfig.public.buildSha.slice(0, 7));
const buildTime = computed(() => runtimeConfig.public.buildTime);
</script>
