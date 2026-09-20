import { onMounted, ref } from "vue";

export function usePwaStorage() {
  const isStandalone = ref(false);
  const isPersistent = ref(false);

  onMounted(async () => {
    isStandalone.value =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true;

    if (!navigator.storage?.persisted) return;

    isPersistent.value = await navigator.storage.persisted();
    if (!isPersistent.value && navigator.storage.persist) {
      isPersistent.value = await navigator.storage.persist();
    }
  });

  return { isStandalone, isPersistent };
}
