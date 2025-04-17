<script lang="ts" setup>
function reportIssue() {
  // TODO implement
}
</script>

<template>
  <div class="flex flex-col text-foreground mt-24">
    <div class="text-center">
      <fa icon="exclamation-circle" class="text-6xl text-destructive mb-4" />
      <h1 class="text-4xl font-bold mb-4">Oops! Something went wrong</h1>
      <p class="text-lg text-muted-foreground mb-8">
        We couldn't process your request. Please try again later or contact
        support if the issue persists.
      </p>
      <div class="flex flex-col sm:flex-row gap-4 justify-center">
        <Button variant="default" size="lg" as-child>
          <NuxtLink to="/">Go Back Home</NuxtLink>
        </Button>

        <!-- <Button variant="outline" @click="reportIssue">Report Issue</Button> -->
      </div>
    </div>
  </div>
</template>
