<script lang="ts" setup>
definePageMeta({ layout: "admin" });
</script>

<template>
  <div class="flex flex-col gap-6">
    <div class="flex flex-col">
      <div class="flex w-full items-start gap-4 flex-wrap">
        <!-- {{ error }}
      {{ syncStatus }} -->
        <Card class="w-[400px]">
          <CardHeader>
            <CardTitle>Departments</CardTitle>
          </CardHeader>
          <CardContent>
            <CardDescription>
              Configure department mappings from our retailers to MyGroceries.
            </CardDescription>
          </CardContent>
          <CardFooter>
            <NuxtLink to="/admin/departments" class="text-blue-500 text-sm">
              Configure Departments &rarr;
            </NuxtLink>
          </CardFooter>
        </Card>

        <!-- <Card class="w-[400px]">
          <CardHeader>
            <CardTitle>Manage Products</CardTitle>
          </CardHeader>
          <CardContent>
            <CardDescription>
              Manage products advertised on MyGroceries.
            </CardDescription>
          </CardContent>
          <CardFooter>
            <NuxtLink to="/admin/catalog" class="text-blue-500 text-sm">
              View Products &rarr;
            </NuxtLink>
          </CardFooter>
        </Card> -->

        <Card class="w-[400px]">
          <CardHeader>
            <CardTitle> Stores</CardTitle>
          </CardHeader>
          <CardContent>
            <CardDescription>
              Manage retailer stores. Configure sync schedules, proxies, etc.
            </CardDescription>
          </CardContent>
          <CardFooter>
            <NuxtLink to="/admin/stores" class="text-blue-500 text-sm">
              Configure Stores &rarr;
            </NuxtLink>
          </CardFooter>
        </Card>

        <Card class="w-[400px]">
          <CardHeader>
            <CardTitle>Jobs</CardTitle>
          </CardHeader>
          <CardContent>
            <CardDescription>
              Monitor & run maintenance jobs that are running on the server.
            </CardDescription>
          </CardContent>
          <CardFooter>
            <NuxtLink to="/admin/sync" class="text-blue-500 text-sm">
              View &rarr;
            </NuxtLink>
          </CardFooter>
        </Card>

        <Card class="w-[400px]">
          <CardHeader>
            <CardTitle>Disk Usage</CardTitle>
          </CardHeader>
          <CardContent>
            <CardDescription> Monitor disk & resource usage. </CardDescription>
          </CardContent>
          <CardFooter>
            <NuxtLink to="/admin/disk" class="text-blue-500 text-sm">
              View &rarr;
            </NuxtLink>
          </CardFooter>
        </Card>

        <Card class="w-[400px]">
          <CardHeader>
            <CardTitle>Discord</CardTitle>
          </CardHeader>
          <CardContent>
            <CardDescription>
              Manage Discord bot interactions.
            </CardDescription>
          </CardContent>
          <CardFooter>
            <NuxtLink to="/admin/discord" class="text-blue-500 text-sm">
              View &rarr;
            </NuxtLink>
          </CardFooter>
        </Card>
      </div>
    </div>
  </div>
</template>
