<template>
  <div class="flex flex-col gap-4 min-h-[100vh]">
    <nav
      class="w-full flex items-center py-4 border-b bg-muted-background px-4"
    >
      <div class="max-w-7xl mx-auto space-x-6 flex w-full">
        <nuxt-link to="/admin" class="font-medium">
          <fa icon="tachometer-alt" class="mr-1" />
          <span class="hidden md:inline">Dashboard</span>
        </nuxt-link>
        <nuxt-link to="/admin/stores" class="font-medium">
          <fa icon="store" class="mr-1" />
          <span class="hidden md:inline">Stores</span>
        </nuxt-link>

        <!--
        <nuxt-link to="/admin/products" class="font-medium">
          <fa icon="box" />
          Products
        </nuxt-link>
        -->

        <nuxt-link to="/admin/departments" class="font-medium">
          <fa icon="boxes-stacked" class="mr-1" />
          <span class="hidden md:inline"> Departments</span>
        </nuxt-link>

        <nuxt-link to="/admin/disk" class="font-medium">
          <fa icon="database" class="mr-1" />
          <span class="hidden md:inline">Disk Usage</span>
        </nuxt-link>

        <nuxt-link to="/admin/sync" class="font-medium">
          <fa icon="clock" class="mr-1" />
          <span class="hidden md:inline">Jobs</span>
        </nuxt-link>

        <div class="flex-1"></div>

        <nuxt-link to="/" class="font-medium">
          <fa icon="times" class="mr-1" />
          <span class="hidden md:inline">Close Admin</span>
        </nuxt-link>
      </div>
    </nav>
    <main class="max-w-7xl mx-auto w-full flex flex-col pb-24 px-4 xl:px-0">
      <slot />
    </main>
  </div>
</template>
