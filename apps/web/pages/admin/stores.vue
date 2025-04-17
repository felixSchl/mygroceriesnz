<script lang="ts" setup>
import { cn } from "@/lib/utils";
import type { AppRouter } from "@repo/backend/trpc";
import type { Retailer, StoreId, SyncSchedule } from "@repo/db";
import { formatStoreId, parseStoreId } from "@repo/db/codecs";
import type { inferProcedureOutput } from "@trpc/server";
import { formatDistance } from "date-fns";
import { format } from "date-fns-tz";
import { z } from "zod";

definePageMeta({ layout: "admin" });

const syncScheduleOptions: SyncSchedule[] = [
  "never",
  "daily",
  "weekly",
  "monthly",
];

const toast = useToast();
const trpc = useTrpc();
const router = useRouter();

// sync state (per store)
const isStarting = ref(new Set<string>());
const hasRequestedCancellation = ref(new Set<string>());

// filter list by retailer
const retailer: Ref<"all" | Retailer> = ref(
  (() => {
    const r = z
      // TODO could use a common retailer codec here
      .enum(["all", "nw", "pns", "ww"])
      .safeParse(router.currentRoute.value.query.retailer);
    return r.success ? r.data : "all";
  })(),
);

const radius = ref(15);

const {
  data: storesList,
  error,
  refresh,
} = await trpc.admin.stores.useQuery(
  () => ({
    retailer: retailer.value,
  }),
  {
    lazy: true,
    server: true,
  },
);

const { data: storesPendingSync_ } =
  await trpc.admin.getStoresPendingSync.useQuery();
const storesPendingSync = computed(() => {
  const out = new Set<string>();
  for (const store of storesPendingSync_.value ?? []) {
    out.add(formatStoreId(store.retailer, store.id));
  }
  return out;
});

const { data: storeMappings } = await trpc.admin.getStoreMappings.useQuery();

const storeMappingsEdit = ref(
  new Map<
    StoreId,
    string // this is just the id, since we cannot map stores cross retailers.
  >(
    // TODO(TS) unfortunately Object.entries() returns string[] not StoreId[]
    Object.entries(storeMappings.value ?? {}) as [StoreId, string][],
  ),
);

// the currently selected store data. this data is not updated when realtime
// updates come in as the user is conceptually editing this information in the
// UI.
// we capture this data,
//   1. once at page load, based on the query param & server-side data
//   2. when the user clicks on a store in the map (at which point the data is
//      already available client side.)
const selectedStore = ref<{
  retailer: Retailer;
  id: string;
  syncSchedule: SyncSchedule | null;
  location: {
    x: number;
    y: number;
  } | null;
} | null>(
  (() => {
    const storeString = router.currentRoute.value.query.store as string;
    const parsed = parseStoreId(storeString);
    if (!parsed) return null;
    const remoteData = storesList.value?.find(
      (s) => s.retailer === parsed.retailer && s.id === parsed.id,
    );
    if (!remoteData) return null;
    return {
      id: remoteData.id,
      retailer: remoteData.retailer,
      syncSchedule: remoteData.syncSchedule ?? "never",
      location: remoteData.location,
    };
  })(),
);

const mapRef = ref();

// ...
function selectStore(store: {
  retailer: Retailer;
  id: string;
  syncSchedule: SyncSchedule | null;
  location: {
    x: number;
    y: number;
  } | null;
}) {
  selectedStore.value = store;

  // scroll to the selected store on the map
  mapRef.value.centerOnStore(store.id);

  // scroll to top of page where the selected store details are displayed
  window.scrollTo({ top: 0, behavior: "smooth" });

  // update the query param so that the store is selected in the url
  router.replace({
    query: {
      ...router.currentRoute.value.query,
      store: formatStoreId(store.retailer, store.id),
    },
  });
}

// the currently selected store data, updated in realtime.
// this is used for non-editable fields like last synced, job status, etc.
const selectedStoreLiveData = computed(() => {
  const st = selectedStore.value;
  if (!st) return null;
  return storesList.value?.find(
    (s) => s.retailer === st.retailer && s.id === st.id,
  );
});

function recencyCSSClass(
  store: inferProcedureOutput<AppRouter["admin"]["stores"]>[number],
) {
  if (!store.lastSyncedAt) return "never";
  if (
    isWithinExpiration(
      store.lastSyncedAt,
      1000 * 60 * 60 * 24, // 24 hours
    )
  ) {
    return "recently";
  }
  return "some-time-ago";
}

// the stores that are nearby the currently selected store.
const nearbyStores = computed(() => {
  const st = selectedStore.value;
  if (!st || !storesList.value) return [];

  return storesList.value
    .map((store) => {
      // Must be same retailer but different store
      const isValidStore = store.retailer === st.retailer && store.id !== st.id;

      // If either store is missing location data, don't include it
      if (!st.location || !store.location) return null;

      // Calculate distance
      const distance = calculateDistance(
        st.location.y,
        st.location.x,
        store.location.y,
        store.location.x,
      );

      // Filter stores within radius
      if (!isValidStore || distance > radius.value) return null;

      return {
        ...store,
        distanceKm: distance,
      };
    })
    .filter(
      (store): store is typeof store & { distanceKm: number } => store !== null,
    )
    .sort((a, b) => a.distanceKm - b.distanceKm);
});

// Helper function to calculate distance between coordinates (in kilometers)
function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
) {
  const R = 6371; // Earth's radius in kilometers
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

watchEffect(() => {
  storesList.value; // watch
  hasRequestedCancellation.value.clear();
  isStarting.value.clear();
}, {});

const JOB_POLL_INTERVAL = 2000;

let stop = false;
onMounted(() => {
  (async () => {
    while (!stop) {
      await refresh();
      await new Promise((resolve) => setTimeout(resolve, JOB_POLL_INTERVAL));
    }
  })();
});

onUnmounted(() => {
  stop = true;
});

// start a sync job for a store
async function scrapeStore(retailer: Retailer, storeId: string) {
  const key = retailer + "/" + storeId;
  isStarting.value.add(key);
  try {
    await trpc.admin.startJob.mutate({
      fn: "scrape/products",
      retailer,
      storeId,
    });
    toast.success("Started syncing...");
  } catch (e) {
    toast.error("Failed to start syncing... Check logs for details.");
    console.error("Failed to start job", e);
  }
}

// sync retailer filter to url query param
watch(retailer, (retailer) => {
  router.replace({
    query: {
      ...router.currentRoute.value.query,
      retailer,
    },
  });
});

function isWithinExpiration(lastSyncedAt: Date, windowMs: number) {
  return new Date().getTime() - lastSyncedAt.getTime() < windowMs;
}

function setProxy(
  retailer: Retailer,
  storeId: string,
  proxyStoreId: string | null,
): boolean {
  const key = formatStoreId(retailer, storeId);
  const ok = (() => {
    if (!proxyStoreId) {
      storeMappingsEdit.value.delete(key);
      return true;
    }

    // Prevent self-referential proxies
    if (key === proxyStoreId) {
      console.warn("Cannot set proxy target to itself");
      return false;
    }

    // Check if the target is already a proxy (to prevent chaining)
    for (const [source, target] of Object.entries(
      storeMappingsEdit.value ?? {},
    )) {
      // If attempting bidirectional connection, delete the existing connection
      if (
        source === formatStoreId(retailer, proxyStoreId) &&
        formatStoreId(retailer, target) === key
      ) {
        storeMappingsEdit.value.delete(source);
        toast.warning("Removed existing proxy connection");
        break;
      }
    }

    storeMappingsEdit.value.set(key, proxyStoreId);
    return true;
  })();

  if (ok) {
    trpc.admin.updateStoreMappings.mutate({
      mappings: Object.fromEntries(storeMappingsEdit.value),
    });
  }

  return ok;
}

// Clear store selection
function clearSelectedStore() {
  selectedStore.value = null;
  const query = { ...router.currentRoute.value.query };
  delete query.store;
  router.replace({ query });
}

// Add this near other refs at the top of the script
const hideProxiedStores = ref(false);

// Add this computed property
const filteredStores = computed(() => {
  if (!storesList.value) return [];
  return storesList.value.filter(
    (store) =>
      !hideProxiedStores.value ||
      !storeMappingsEdit.value.has(formatStoreId(store.retailer, store.id)),
  );
});
</script>

<template>
  <div v-if="error">
    <AdminErrorScreen :error="error" />
  </div>
  <div v-else-if="!storesList">
    <AdminLoadingScreen />
  </div>

  <div v-else>
    <div class="mb-12 flex">
      <!-- map -->
      <div class="flex-1 h-[500px]">
        <ClientOnly>
          <StoreMap
            :ref="
              (el) => {
                if (el && mapRef !== el) {
                  mapRef = el;
                  if (selectedStore) {
                    mapRef.centerOnStore(selectedStore.id);
                  }
                }
              }
            "
            :selected-store-id="selectedStore?.id"
            :radius="radius"
            :proxy-mappings="storeMappingsEdit"
            :stores="
              storesList.map((s) => {
                // if 's' is currently selected store, use that data instead
                const o = s.id === selectedStore?.id ? selectedStore : s;
                return {
                  ...o,
                  name: s.json?.name ?? o.id,
                };
              })
            "
            @store-click="selectStore($event)"
            @update:radius="radius = $event"
          />
        </ClientOnly>
      </div>

      <!-- selected store details -->
      <div
        v-if="selectedStore"
        class="border-l border-l-blue-500/20 ml-2 pl-2 w-[400px]"
      >
        <div class="flex flex-col gap-2">
          <!-- selected store header -->
          <div class="flex gap-4 items-end">
            <RetailerIcon
              :retailer="selectedStore.retailer"
              class="w-[40px] h-[40px]"
            />

            <div class="flex flex-col">
              <button
                class="text-xl font-bold hover:text-blue-500 text-left"
                @click="selectStore(selectedStore)"
              >
                {{ selectedStoreLiveData?.json?.name }}
              </button>
              <div v-if="selectedStoreLiveData?.lastSyncedAt">
                <div class="text-muted-foreground text-xs">
                  Last synced
                  {{
                    formatDistance(
                      new Date(),
                      new Date(selectedStoreLiveData?.lastSyncedAt),
                    )
                  }}
                  ago
                  <template
                    v-if="
                      selectedStoreLiveData?.job?.endedAt &&
                      selectedStoreLiveData?.job?.startedAt
                    "
                  >
                    (took
                    {{
                      formatDistance(
                        new Date(selectedStoreLiveData.job.endedAt),
                        new Date(selectedStoreLiveData.job.startedAt),
                      )
                    }})
                  </template>
                </div>
              </div>
            </div>
          </div>

          <!-- syncing -->
          <div class="flex flex-col-reverse gap-2 pb-6 border-b">
            <div v-if="selectedStoreLiveData?.job?.status === 'RUNNING'">
              <div class="text-muted-foreground text-xs">
                Started Syncing
                {{
                  formatDistance(
                    new Date(),
                    new Date(selectedStoreLiveData?.job.startedAt),
                  )
                }}
                ago
              </div>
            </div>

            <!-- start sync -->
            <Button
              v-if="selectedStoreLiveData?.job?.status !== 'RUNNING'"
              variant="outline"
              class="w-fit"
              size="sm"
              :disabled="
                isStarting.has(selectedStore.retailer + '/' + selectedStore.id)
              "
              @click="scrapeStore(selectedStore.retailer, selectedStore.id)"
            >
              <template
                v-if="
                  isStarting.has(
                    selectedStore.retailer + '/' + selectedStore.id,
                  )
                "
              >
                Starting...
              </template>
              <template v-else>
                <fa icon="cloud-download" />
                Sync Store Now</template
              >
            </Button>

            <!-- cancel sync -->
            <Button
              v-if="selectedStoreLiveData?.job?.status === 'RUNNING'"
              class="w-fit"
              variant="destructive"
              size="sm"
              :disabled="
                hasRequestedCancellation.has(
                  selectedStore.retailer + '/' + selectedStore.id,
                )
              "
              @click="
                () => {
                  if (!selectedStoreLiveData?.job || !selectedStore) return;
                  const key = selectedStore.retailer + '/' + selectedStore.id;
                  hasRequestedCancellation.add(key);
                  trpc.admin.cancelJob.mutate(selectedStoreLiveData.job.id);
                }
              "
            >
              <template
                v-if="
                  !hasRequestedCancellation.has(
                    selectedStore.retailer + '/' + selectedStore.id,
                  )
                "
              >
                Cancel sync
              </template>
              <template v-else> Cancelling... </template>
            </Button>

            <template v-if="selectedStoreLiveData?.job?.inngestRunId">
              <!-- TODO env variable -->
              <NuxtLink
                :to="$inngest.runURL(selectedStoreLiveData.job.inngestRunId)"
                target="_blank"
                class="text-blue-500 text-sm w-fit"
              >
                View latest run details <fa icon="arrow-right" />
              </NuxtLink>
            </template>
          </div>

          <template
            v-if="
              storeMappingsEdit.has(
                formatStoreId(selectedStore.retailer, selectedStore.id),
              )
            "
          >
            <div class="text-muted-foreground text-sm">
              This store is currently mirroring another store. Sync settings
              cannot be configured while mirroring.
            </div>
            <Button
              variant="destructive"
              size="sm"
              class="w-fit mt-2"
              @click="setProxy(selectedStore.retailer, selectedStore.id, null)"
            >
              <fa icon="unlink" class="mr-2" />
              Unlink Proxy
            </Button>
          </template>

          <template v-else>
            <!-- sync schedule -->
            <div class="flex gap-2 flex-col mt-2">
              <div class="flex gap-x-2 items-center">
                <h3 class="font-bold">Sync Schedule</h3>
              </div>

              <p class="text-muted-foreground text-xs mb-2">
                Choose how often this store should be synced.
              </p>

              <label for="syncSchedule">
                <Select
                  id="syncSchedule"
                  class="w-full"
                  :model-value="selectedStore.syncSchedule ?? ''"
                  @update:model-value="
                    (se) => {
                      const s = selectedStore;
                      if (!s) return;
                      const o = s.syncSchedule;
                      s.syncSchedule = se;
                      trpc.admin.updateStore
                        .mutate({
                          retailer: s.retailer,
                          storeId: s.id,
                          updates: {
                            syncSchedule: se,
                          },
                        })
                        .then(
                          () => {
                            toast.success('Sync schedule updated');
                          },
                          () => {
                            toast.error('Failed to update sync schedule');
                            s.syncSchedule = o;
                          },
                        );
                    }
                  "
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select sync schedule" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem
                      v-for="option in syncScheduleOptions"
                      :key="option"
                      :value="option"
                      class="capitalize"
                    >
                      {{ option }}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </label>
            </div>

            <!-- proxy configuration -->
            <div class="flex gap-2 mt-4 flex-col">
              <div class="flex gap-x-2 items-center">
                <h3 class="font-bold">Mirrors</h3>
              </div>
              <p class="text-muted-foreground text-xs mb-4">
                Select stores within {{ radius }}km to mirror this store's
                catalog.
              </p>

              <div class="space-y-2">
                <template v-if="nearbyStores.length">
                  <!-- eslint-disable-next-line vuejs-accessibility/label-has-for -->
                  <label
                    v-for="store in nearbyStores"
                    :key="store.id"
                    class="flex items-center space-x-2 cursor-pointer"
                    :for="`proxy-${store.id}`"
                  >
                    <input
                      :id="`proxy-${store.id}`"
                      type="checkbox"
                      :checked="
                        storeMappingsEdit.get(
                          formatStoreId(store.retailer, store.id),
                        ) === selectedStore.id
                      "
                      @change="
                        ($event: any) => {
                          if (!selectedStore) return;
                          const success = setProxy(
                            store.retailer,
                            store.id,
                            $event.target.checked ? selectedStore.id : null,
                          );
                          // If setProxy returns false, prevent the checkbox from being checked
                          if (!success) {
                            $event.target.checked = false;
                          }
                        }
                      "
                    />
                    <span>
                      {{ store.json?.name }}
                      <span class="text-muted-foreground text-sm">
                        ({{ store.distanceKm.toFixed(1) }}km)
                      </span>
                    </span>
                  </label>
                </template>

                <div v-else class="text-muted-foreground text-sm">
                  No other stores from this retailer in the area ({{
                    radius.toFixed(1)
                  }}
                  km radius)
                </div>
              </div>
            </div>
          </template>
        </div>
      </div>
    </div>

    <!-- retailer filter -->
    <div class="mb-8 flex pt-4 gap-x-4 items-center">
      <!-- eslint-disable-next-line vuejs-accessibility/form-control-has-label -->
      <Select v-model="retailer">
        <SelectTrigger class="w-[180px]">
          <SelectValue placeholder="Select proxy store" />
        </SelectTrigger>

        <SelectContent>
          <SelectItem value="all">All</SelectItem>
          <SelectItem value="pns">Pak'nSave</SelectItem>
          <SelectItem value="nw">New World</SelectItem>
          <SelectItem value="ww">Countdown</SelectItem>
        </SelectContent>
      </Select>

      <div class="text-muted-foreground text-sm">
        Showing {{ filteredStores.length }}/{{ storesList.length }} stores
      </div>

      <div class="flex-1"></div>

      <!-- hide proxied stores -->
      <!-- eslint-disable-next-line vuejs-accessibility/label-has-for -->
      <label
        class="flex items-center gap-2 text-sm text-muted-foreground"
        for="hideProxiedStores"
      >
        <Checkbox
          id="hideProxiedStores"
          :checked="hideProxiedStores"
          @update:checked="hideProxiedStores = $event"
        />
        Hide proxied stores
      </label>
    </div>

    <!-- stores list -->
    <ul class="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <li
        v-for="store in filteredStores"
        :key="store.retailer + '/' + store.id"
        :class="
          cn(
            'flex flex-col border p-2 rounded-md',
            `synced-${recencyCSSClass(store)}`,
            store.job?.status ? `job-status-${store.job.status}` : '',
          )
        "
      >
        <div class="flex items-center">
          <RetailerIcon
            :retailer="store.retailer"
            class="w-[24px] h-[24px] mr-4 self-start"
          />
          <div class="flex flex-col">
            <div class="flex items-center gap-2 mb-1">
              <button class="flex cursor-pointer" @click="selectStore(store)">
                {{ store.json?.name }}
              </button>
              <Badge
                v-if="store.syncSchedule"
                variant="secondary"
                class="capitalize"
              >
                <fa icon="clock" class="mr-2" />
                {{ store.syncSchedule }}
              </Badge>

              <Badge
                v-if="
                  storesPendingSync.has(formatStoreId(store.retailer, store.id))
                "
                variant="destructive"
              >
                Pending Sync
              </Badge>

              <Badge
                v-if="
                  storeMappingsEdit.has(formatStoreId(store.retailer, store.id))
                "
                variant="secondary"
              >
                <fa icon="link" class="mr-2" />
                Proxied
              </Badge>
            </div>

            <div
              class="text-muted-foreground font-mono text-xs break-words mb-1"
            >
              {{ store.id }}
            </div>

            <div v-if="store.lastSyncedAt">
              <div class="text-muted-foreground text-xs mb-2">
                Last synced
                {{ formatDistance(new Date(), new Date(store.lastSyncedAt)) }}
                ago
                <template v-if="store.job?.endedAt && store.job?.startedAt">
                  (took
                  {{
                    formatDistance(
                      new Date(store.job.endedAt),
                      new Date(store.job.startedAt),
                    )
                  }})
                </template>
              </div>
            </div>

            <div
              class="flex items-center gap-2 text-muted-foreground text-xs mt-2"
            >
              <fa icon="cloud-download" />
              <template v-if="store.lastSyncedAt">
                {{
                  format(new Date(store.lastSyncedAt), "yyyy-MM-dd HH:mm:ss")
                }}
              </template>
              <template v-else>not synced</template>
            </div>

            <div
              class="flex items-center gap-2 text-muted-foreground text-xs mt-2"
            >
              <button
                v-if="store.location"
                class="flex items-center gap-2 hover:text-blue-500"
                @click="selectStore(store)"
              >
                <fa icon="location" />
                <span>
                  {{ store.location.x.toFixed(4) }},
                  {{ store.location.y.toFixed(4) }}
                </span>
              </button>
              <span v-else class="flex items-center gap-2">
                <fa icon="location" />
                <span>No location data</span>
              </span>
            </div>
          </div>
          <div class="flex-1"></div>

          <div class="flex flex-col items-end gap-2 self-start">
            <!-- start sync -->
            <Button
              v-if="store.job?.status !== 'RUNNING'"
              variant="outline"
              class="w-fit"
              size="sm"
              :disabled="isStarting.has(store.retailer + '/' + store.id)"
              @click="scrapeStore(store.retailer, store.id)"
            >
              <template v-if="isStarting.has(store.retailer + '/' + store.id)">
                Starting...
              </template>
              <template v-else>
                <fa icon="cloud-download" />
                Sync Store Now
              </template>
            </Button>

            <!-- cancel sync -->
            <Button
              v-if="store.job?.status === 'RUNNING'"
              class="w-fit"
              variant="destructive"
              size="sm"
              :disabled="
                hasRequestedCancellation.has(store.retailer + '/' + store.id)
              "
              @click="
                () => {
                  if (!store.job) return;
                  const key = store.retailer + '/' + store.id;
                  hasRequestedCancellation.add(key);
                  trpc.admin.cancelJob.mutate(store.job.id);
                }
              "
            >
              <template
                v-if="
                  !hasRequestedCancellation.has(store.retailer + '/' + store.id)
                "
              >
                Cancel
              </template>
              <template v-else> Cancelling... </template>
            </Button>

            <template v-if="store.job?.inngestRunId">
              <!-- TODO env variable -->
              <NuxtLink
                :to="$inngest.runURL(store.job.inngestRunId)"
                target="_blank"
                class="text-blue-500 text-sm w-fit"
              >
                View latest run details <fa icon="arrow-right" />
              </NuxtLink>
            </template>
            <template v-else>
              <span class="text-muted-foreground text-sm"
                >No run details available
              </span>
            </template>
          </div>
        </div>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.job-status-RUNNING {
  @apply border-l-4 border-l-blue-500;
}

.job-status-COMPLETED {
  @apply border-l-4 border-l-green-500;
}

.job-status-FAILED {
  @apply border-l-4 border-l-red-500;
}

.job-status-CANCELLED {
  @apply border-l-4 border-l-gray-500;
}

.synced-never {
  @apply bg-gray-300/10;
}

.synced-some-time-ago {
  @apply bg-yellow-500/10;
}

.synced-recently {
  @apply bg-green-500/10;
}
</style>
