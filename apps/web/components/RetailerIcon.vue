<script lang="ts" setup>
import type { Retailer } from "@repo/db";

defineProps<{
  retailer: Retailer;
}>();

const Retailers: Record<
  Retailer,
  {
    name: string;
  }
> = {
  nw: { name: "New World" },
  ww: { name: "Woolworths" },
  pns: { name: "PAK'nSAVE" },
};
</script>

<template>
  <img :src="`/${retailer}.svg`" :alt="Retailers[retailer].name" />
</template>
