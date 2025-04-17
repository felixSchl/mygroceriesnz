<script lang="ts" setup>
defineProps<{
  error: any;
}>();
</script>

<template>
  <div class="flex flex-col text-foreground mt-24">
    <div class="text-center">
      <fa icon="exclamation-circle" class="text-6xl text-destructive mb-4" />
      <h1 class="text-4xl font-bold mb-4">Oops! Something went wrong</h1>
      <pre
        class="mt-8 text-lg text-left text-background mb-8 max-w-[700px] bg-foreground text-wrap mx-auto rounded-lg p-4 whitespace-break-spaces break-words break-all"
      >
        {{ error }}
      </pre>
    </div>
  </div>
</template>
