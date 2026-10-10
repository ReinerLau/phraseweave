<template>
  <form
    v-if="remoteUsername"
    action="/remote/logout"
    method="post"
  >
    <button
      type="submit"
      class="btn btn-sm"
      :title="`退出 ${remoteUsername} 的登录`"
    >
      退出登录
    </button>
  </form>
</template>

<script setup lang="ts">
import { remoteUsername } from "~/services/remoteSession";
</script>
