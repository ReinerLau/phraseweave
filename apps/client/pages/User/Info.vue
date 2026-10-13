<template>
  <div class="flex min-h-full min-w-0 flex-1 flex-col px-6 py-8 lg:px-8">
    <div class="mb-6">
      <BackLink
        label="返回练习清单"
        to="/"
      />
    </div>
    <div class="flex min-w-0 flex-1">
      <UserMenu
        :menus="userMenus"
        :defaultMenuName="defaultMenuName"
        @changeMenu="handleChangeMenu"
      />
      <div class="min-w-0 flex-1 overflow-x-auto pl-4">
        <component :is="currentComponent"></component>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, shallowRef, watchEffect } from "vue";
import { useRoute } from "vue-router";

import BackLink from "~/components/common/BackLink.vue";
import UserSetting from "~/components/user/Setting.vue";

interface ComponentMap {
  Setting: typeof UserSetting;
}

interface Menu {
  name: string;
  component: keyof ComponentMap;
}

const route = useRoute();
const userMenus = ref([{ name: "设置", component: "Setting" }]);
const componentMap: ComponentMap = {
  Setting: UserSetting,
};
const currentComponent = shallowRef(componentMap.Setting); // shallowRef is used to fixed Vue warn

const defaultMenuName = computed(() =>
  route.query.displayComponent === "Setting" ? "设置" : "主页",
);

watchEffect(() => {
  const routeComponent = route.query.displayComponent;
  currentComponent.value = componentMap[routeComponent as keyof typeof componentMap];
});

function handleChangeMenu(menu: Menu) {
  currentComponent.value = componentMap[menu.component];
}
</script>
