<template>
  <span
    v-for="(group, index) in groups"
    :key="index"
    class="question-input-group"
  >
    <template
      v-for="(token, tokenIndex) in group"
      :key="tokenIndex"
    >
      <slot
        v-if="token.kind === 'word'"
        name="word"
        :token="token"
      />
      <span
        v-else
        class="cloze-punctuation"
        >{{ token.text }}</span
      >
    </template>
  </span>
</template>

<script setup lang="ts">
import { computed } from "vue";

import type { ClozeToken } from "~/utils/clozeText";
import { groupClozeTokens } from "~/utils/clozeText";

const props = defineProps<{ tokens: ClozeToken[] }>();
const groups = computed(() => groupClozeTokens(props.tokens));
</script>
