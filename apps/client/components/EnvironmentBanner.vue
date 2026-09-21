<template>
  <aside
    v-if="isDeployedEnvironment"
    data-testid="environment-banner"
    class="w-full bg-amber-300 px-4 py-2 text-center text-sm font-semibold text-amber-950"
  >
    {{ environmentLabel }} · {{ buildVersion }}
  </aside>
</template>

<script setup lang="ts">
import { useRuntimeConfig } from "nuxt/app";
import { computed } from "vue";

const runtimeConfig = useRuntimeConfig();
const deploymentEnvironment = computed(() => runtimeConfig.public.deploymentEnvironment);
const isDeployedEnvironment = computed(() =>
  ["preview", "production"].includes(deploymentEnvironment.value),
);
const environmentLabel = computed(() =>
  deploymentEnvironment.value === "preview" ? "测试环境" : "正式环境",
);
const buildVersion = computed(() => runtimeConfig.public.buildVersion);
</script>
