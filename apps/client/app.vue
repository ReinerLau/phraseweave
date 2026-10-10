<template>
  <NuxtLayout>
    <HttpErrorProvider>
      <NuxtPage />
    </HttpErrorProvider>
  </NuxtLayout>
</template>

<script setup lang="ts">
import { useLogto } from "@logto/vue";
import { onMounted } from "vue";

import { useDarkMode } from "~/composables/darkMode";
import { isAuthEnabled, isAuthenticated } from "~/services/auth";
import { loadRemoteSession } from "~/services/remoteSession";
import { useUserStore } from "./store/user";

const { initDarkMode } = useDarkMode();

async function setup() {
  if (!isAuthEnabled()) return;

  const userStore = useUserStore();
  const logto = useLogto();

  if (isAuthenticated()) {
    const res = await logto.fetchUserInfo();
    userStore.initUser(res!);
  }
}

setup();

onMounted(() => {
  initDarkMode();
  void loadRemoteSession();
});
</script>

<style>
#jfToolbar,
.mod-json {
  display: none !important;
}
</style>
