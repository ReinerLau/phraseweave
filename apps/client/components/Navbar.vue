<template>
  <header
    :class="isStickyNavBar"
    class="top-0 z-20 w-full bg-opacity-50 font-customFont backdrop-blur-xl"
  >
    <div class="mx-auto max-w-screen-xl px-6">
      <div class="flex h-16 items-center justify-between">
        <div class="flex flex-1 items-center justify-between">
          <NuxtLink to="/">
            <div class="logo flex items-center">
              <img
                width="48"
                height="48"
                class="mr-6 hidden overflow-hidden rounded-md min-[800px]:block"
                :src="logoPath"
                alt="phraseweave-logo"
              />
              <h1 class="text-wrap text-2xl font-extrabold leading-normal dark:text-white">
                PhraseWeave
              </h1>
              <span class="ml-2 text-xs font-medium text-gray-400 dark:text-gray-500">
                v{{ appVersion }}
              </span>
            </div>
          </NuxtLink>
        </div>

        <div class="flex items-center">
          <!-- 显示用户信息 -->
          <div
            v-if="isAuthenticated()"
            class="logged-in flex items-center"
          >
            <div class="font-500 mx-2 max-w-[4em] truncate min-[500px]:max-w-[6em]">
              {{ userStore.userInfo?.username }}
            </div>
            <DropMenu @update-show-modal="handleLogout" />
          </div>

          <!-- 登录/注册 -->
          <button
            v-else-if="isAuthEnabled()"
            @click="signIn()"
            aria-label="Login"
            class="rounded-md bg-purple-500 px-5 py-2.5 text-sm font-medium text-white shadow-lg transition-all duration-300 ease-in-out hover:bg-purple-600 focus:outline-none focus:ring-2 focus:ring-purple-700"
          >
            <span class="relative">登录</span>
          </button>

          <!-- 切换主题 -->
          <button
            class="btn btn-ghost btn-sm ml-1 h-8 w-8 rounded-md p-0"
            @click="toggleDarkMode"
          >
            <span
              class="h-6 w-6"
              :class="isDarkMode ? 'i-ph-moon' : 'i-ph-sun'"
            ></span>
          </button>
        </div>
      </div>
    </div>
  </header>
  <MainMessageBox
    v-model:isShowModal="isShowModal"
    title="提示"
    content="是否确认退出登录？"
    @confirm="signOut()"
  />
</template>

<script setup lang="ts">
import { useRuntimeConfig } from "nuxt/app";
import { computed, ref } from "vue";
import { useRoute } from "vue-router";

import { Theme, useDarkMode } from "~/composables/darkMode";
import { isAuthEnabled, isAuthenticated, signIn, signOut } from "~/services/auth";
import { useUserStore } from "~/store/user";

const route = useRoute();
const runtimeConfig = useRuntimeConfig();
const logoPath = `${runtimeConfig.app.baseURL}logo.png`;
const appVersion = runtimeConfig.public.appVersion;
const userStore = useUserStore();
const { darkMode, toggleDarkMode } = useDarkMode();

const isShowModal = ref(false);

const isDarkMode = computed(() => darkMode.value === Theme.DARK);
const isStickyNavBar = computed(() => {
  // 首页/用户信息页
  if (["index", "User-Info"].includes(route.name as string)) {
    return "sticky";
  }
  return "";
});

const handleLogout = () => {
  isShowModal.value = true;
};
</script>
