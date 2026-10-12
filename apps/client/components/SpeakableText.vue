<template>
  <span
    ><template
      v-for="(token, index) in tokens"
      :key="index"
      ><SpeakableWord
        v-if="token.kind === 'word'"
        :text="token.text"
      /><template v-else>{{ token.text }}</template></template
    ></span
  >
</template>

<script setup lang="ts">
import { computed } from "vue";

import SpeakableWord from "~/components/SpeakableWord.vue";
import { tokenizeClozeText } from "~/utils/clozeText";

const props = defineProps<{ text?: string }>();
const tokens = computed(() => tokenizeClozeText(props.text ?? ""));
</script>
