<script lang="ts" setup>
import { formatStoreId } from "@repo/db/codecs";
import { useDebounce } from "@vueuse/core";
import { formatDistanceToNow } from "date-fns";

defineProps<{}>();

defineEmits<{
  (event: "find"): void;
  (event: "close"): void;
}>();

const trpc = useTrpc();
const searchInput = ref("");
const searchInputDebounced = useDebounce(searchInput, 300);
const location = ref<{ lat: number; lng: number } | null>(null);

const cart = useCart();
const selected = computed(() => Array.from(cart.stores.entries()));

const { data, status, refresh } = trpc.searchStores.useQuery(
  () => ({
    q: searchInputDebounced.value,
    loc: location.value ?? undefined,
  }),
  {
    lazy: true,
    server: false,
    immediate: false,
  },
);

const isLoadingLocation = ref(false);
let ac: AbortController | null = null;
onMounted(() => {
  ac = new AbortController();

  isLoadingLocation.value = true;
  resolveLocationAsync(ac.signal)
    .then((loc) => {
      location.value = loc;
    })
    .finally(() => {
      isLoadingLocation.value = false;
    });
});

const isSearchMode = ref(false);

function beginSearch() {
  isSearchMode.value = true;
  setTimeout(() => {
    searchInputRef.value?.focus();
  }, 100);
}

const searchInputRef = ref<HTMLInputElement | null>(null);

onBeforeUnmount(() => {
  ac?.abort();
  ac = null;
});
</script>

<template>
  <div class="sticky top z-10 bg-background pb-0 mb-0 flex-1">
    <DialogHeader class="h-fit border-b pb-2">
      <DialogTitle class="flex flex-col items-start text-2xl mb-4 p-2 gap-4">
        <h1>Nearby Stores</h1>
        <div class="relative w-full pb-0">
          <Transition name="fade">
            <fa
              v-if="status === 'pending'"
              icon="spinner"
              class="absolute top-2 left-2 animate-spin text-muted-foreground"
            />
            <fa
              v-else
              icon="search"
              class="absolute top-2 left-2 text-muted-foreground/50"
            />
          </Transition>

          <Input
            v-model="searchInput"
            ref="searchInputRef"
            placeholder="Search Name..."
            class="w-full pl-10 pr-12 bg-input text-input-foreground"
          />

          <div v-if="searchInput.length > 0" class="absolute right-0 top-1">
            <Button
              variant="ghost"
              size="sm"
              class="flex items-center text-muted-foreground text-xs gap-1 mr-1"
              @click.prevent="searchInput = ''"
            >
              <span>clear</span>
              <span class="w-[12px] h-[12px] mb-[2px]">
                <fa icon="close" />
              </span>
            </Button>
          </div>
        </div>
      </DialogTitle>
      <p class="text-muted-foreground text-sm mb-2">
        Get started by selecting your local stores. This will help us find the
        best deals for you.
      </p>
    </DialogHeader>

    <div
      v-if="(isLoadingLocation || status === 'pending') && data == null"
      class="flex flex-col gap-y-2 my-12"
    >
      <div
        class="text-2xl text-muted-foreground text-center tracking-tight mb-2"
      >
        <fa icon="spinner" class="animate-spin" />
      </div>
    </div>

    <div v-else-if="status === 'error' && (data == null || data.length === 0)">
      <div class="flex flex-col gap-y-2 my-12">
        <div class="flex flex-col gap-y-2">
          <fa icon="exclamation-triangle" class="text-red-500 text-4xl" />
        </div>
        <div
          class="text-2xl text-muted-foreground text-center tracking-tight mb-2"
        >
          Error loading stores
        </div>
        <div class="text-muted-foreground text-center text-sm mb-2">
          Please try again later.
        </div>

        <Button @click="refresh" class="w-fit mx-auto">
          <fa icon="refresh" />
          Retry
        </Button>
      </div>
    </div>

    <ScrollArea
      type="scroll"
      class="flex-1 min-h-0 overflow-y-auto py-4 relative"
    >
      <template v-if="data?.length === 0">
        <div class="flex flex-col gap-y-2 my-12">
          <div
            class="text text-muted-foreground text-center tracking-tight mb-2"
          >
            No stores found
          </div>
        </div>
      </template>
      <template v-else>
        <div class="flex flex-col gap-y-2 my-4">
          <div
            class="rounded-lg shadow border border-border card-bg p-3"
            v-for="store in data"
            :key="formatStoreId(store.retailer, store.id)"
            @click="
              () => {
                // toggle
                const isSelected = selected.some(
                  ([key, st]) =>
                    st.retailer === store.retailer && st.storeId === store.id,
                );
                if (isSelected) {
                  cart.removeStore(formatStoreId(store.retailer, store.id));
                  return;
                }
                cart.addStore({
                  retailer: store.retailer,
                  storeId: store.id,
                  name: store.name,
                });
              }
            "
          >
            <div class="flex gap-2">
              <RetailerIcon :retailer="store.retailer" class="w-6 h-6" />
              <div class="flex flex-col gap-2">
                <div class="text-sm font-bold">{{ store.name }}</div>

                <!-- distance -->
                <div
                  v-if="store._geoDistance"
                  class="text-xs text-muted-foreground"
                >
                  {{ (store._geoDistance / 1000).toFixed(1) }}km
                </div>

                <div class="text-xs text-muted-foreground">
                  <template v-if="store.lastSyncedAt">
                    Last updated
                    {{ formatDistanceToNow(store.lastSyncedAt) }} ago
                  </template>
                  <template v-else>Not catalogued</template>
                </div>
              </div>
              <div class="flex-1 flex items-center justify-end mr-1">
                <Checkbox
                  :checked="
                    selected.some(
                      ([key, st]) =>
                        st.retailer === store.retailer &&
                        st.storeId === store.id,
                    )
                  "
                />
              </div>
            </div>
          </div>
        </div>
      </template>
    </ScrollArea>
  </div>
</template>
