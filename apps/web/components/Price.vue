<script lang="ts" setup>
import { computed } from "vue";

const props = defineProps<{
  variant?: "lg" | "default" | "sm";
  erased?: boolean;
  price: number;
  noBold?: boolean;
  // unit: 'ea' | 'kg' |
}>();

const parts = computed(() => {
  const [dollars, cents] = props.price.toFixed(2).split(".");
  return {
    dollars: new Intl.NumberFormat("en-US").format(Number(dollars)),
    cents,
  };
});
</script>

<template>
  <div
    class="inline-flex items-baseline no-wrap"
    :class="{
      'line-through text-muted-foreground': erased,
    }"
  >
    <span
      :class="{
        'text-sm': variant === 'sm',
        'text-lg': variant !== 'sm',
        'font-bold': !noBold,
      }"
    >
      <fa icon="dollar-sign" />
    </span>
    <span
      class="tracking-tight text-lg"
      :class="{
        'text-sm': variant === 'sm',
        'text-2xl': variant === 'lg',
        'font-bold': !noBold,
      }"
      >{{ parts.dollars }}</span
    >
    <span
      class="text-sm"
      :class="{
        '!text-xs': variant === 'sm',
        'font-bold': !noBold,
      }"
      >.{{ parts.cents }}</span
    >
  </div>
</template>
