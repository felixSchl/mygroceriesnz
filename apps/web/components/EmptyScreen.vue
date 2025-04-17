<script lang="ts" setup></script>

<template>
  <div class="text-center">
    <h1 class="text-4xl sm:text-4xl font-bold mb-4">
      <slot name="title" />
    </h1>
    <p class="text-muted-foreground text-lg mb-6">
      <slot />
    </p>
    <div class="flex-col sm:flex-row flex justify-center gap-4">
      <Button variant="default" size="lg" as-child>
        <NuxtLink to="/">Go Back Home</NuxtLink>
      </Button>

      <Button variant="outline" size="lg" as-child>
        <NuxtLink to="/search">Browse Products</NuxtLink>
      </Button>
    </div>
  </div>
</template>
