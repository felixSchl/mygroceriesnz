<script lang="ts" setup>
import type { AppRouter } from "@repo/backend/trpc";
import type { inferProcedureOutput } from "@trpc/server";
import { formatDistance } from "date-fns";

type _InngestJob = inferProcedureOutput<
  AppRouter["admin"]["getSyncScreenData"]
>;
type InngestJob = _InngestJob[keyof _InngestJob];

const props = defineProps<{
  type:
    | "daily-sync"
    | "scrape/barcodes"
    | "process/images"
    | "index/products"
    | "index/search";
  job: InngestJob | null;
  pollInterval: number;
}>();

const trpc = useTrpc();
const job = computed(() => props.job);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

const isStarting = ref(false);
const start = async () => {
  isStarting.value = true;
  const timeClicked = Date.now();
  try {
    await trpc.admin.startJob.mutate({
      fn: props.type,
    });
    while (
      job.value == null ||
      new Date(job.value.startedAt).getTime() < timeClicked
    ) {
      await sleep(props.pollInterval);
    }
  } finally {
    isStarting.value = false;
  }
};

const isCancelling = ref(false);
const cancel = async () => {
  isCancelling.value = true;
  try {
    await trpc.admin.cancelJob.mutate(props.type);
    while (job.value?.status === "RUNNING") {
      await sleep(props.pollInterval);
    }
  } finally {
    isCancelling.value = false;
  }
};

const lastRunText = computed(() => {
  if (!job.value?.startedAt) return null;
  return formatDistance(new Date(job.value.startedAt), new Date(), {
    addSuffix: true,
  });
});
</script>

<template>
  <Card class="w-full max-w-[800px] h-fit">
    <CardHeader>
      <div class="flex flex-col">
        <div class="flex flex-col w-full">
          <div class="flex items-center justify-between w-full">
            <CardTitle>
              <slot name="title" />
            </CardTitle>

            <div class="flex items-end gap-2">
              <Button
                v-if="job?.status === 'RUNNING'"
                variant="destructive"
                :disabled="isCancelling"
                @click="cancel"
              >
                <fa v-if="!isCancelling" icon="stop" />
                <fa v-else icon="spinner" class="animate-spin" />
                Cancel Job</Button
              >
              <Button
                v-else
                :disabled="isStarting"
                variant="default"
                @click="start"
              >
                <fa v-if="!isStarting" icon="play" />
                <fa v-else icon="spinner" class="animate-spin" />
                Trigger</Button
              >
            </div>
          </div>

          <div class="w-fit mb-2">
            <template v-if="job && !isCancelling && !isStarting">
              <Badge v-if="job.status === 'RUNNING'" variant="outline">
                <fa icon="spinner" class="animate-spin mr-2" />
                Running</Badge
              >
              <Badge v-else-if="job.status === 'FAILED'" variant="destructive">
                <fa icon="exclamation-triangle" class="mr-2" />
                Failed</Badge
              >
              <Badge
                v-else-if="job.status === 'CANCELLED'"
                variant="destructive"
                >Cancelled</Badge
              >
              <Badge v-else variant="secondary" class="bg-green-200 text-black"
                >Success</Badge
              >
            </template>
          </div>
        </div>

        <div v-if="lastRunText" class="text-muted-foreground text-xs mt-1">
          Last run {{ lastRunText }}
        </div>
      </div>
    </CardHeader>
    <CardContent class="text-sm prose text-muted-foreground">
      <slot name="description" />
    </CardContent>
    <CardFooter>
      <template v-if="!job || (!isCancelling && !isStarting)">
        <template v-if="job?.inngestRunId">
          <NuxtLink
            :to="$inngest.runURL(job.inngestRunId)"
            target="_blank"
            class="text-blue-500 text-sm"
          >
            View latest run details <fa icon="arrow-right" />
          </NuxtLink>
        </template>
        <template v-else>
          <span class="text-muted-foreground text-sm"
            >No run details available
          </span>
        </template>
      </template>
      <template v-else-if="job">
        <span class="text-blue-500 text-sm">
          <fa icon="spinner" class="animate-spin" />
        </span>
      </template>
    </CardFooter>
  </Card>
</template>
