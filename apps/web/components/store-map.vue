<script lang="ts" setup>
import {
  formatStoreId,
  type Retailer,
  type StoreId,
  type SyncSchedule,
} from "@repo/db/codecs.js";
import { Circle, CustomMarker, GoogleMap, Polyline } from "vue3-google-map";

const apiKey = useRuntimeConfig().public.mapsApiKey;
const map = ref<InstanceType<typeof GoogleMap> | null>(null);

const props = defineProps<{
  stores: {
    id: string;
    retailer: Retailer;
    name: string;
    location: null | {
      x: number;
      y: number;
    };
    syncSchedule: SyncSchedule | null;
  }[];
  selectedStoreId?: string;
  radius: number; // in kilometers
  proxyMappings: Map<StoreId, string>;
}>();

const emit = defineEmits<{
  (e: "store-click", store: { retailer: Retailer; id: string }): void;
  (e: "update:radius", radius: number): void;
}>();

const STORAGE_KEY = "store-map-visible-retailers";
const defaultRetailers = new Set<Retailer>(["nw", "pns", "ww"]);

const visibleRetailers = ref(
  new Set<Retailer>(
    JSON.parse(
      localStorage.getItem(STORAGE_KEY) ??
        JSON.stringify(Array.from(defaultRetailers)),
    ),
  ),
);

watch(
  visibleRetailers,
  (newValue) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(newValue)));
  },
  { deep: true },
);

const filteredStores = computed(() =>
  props.stores.filter((store) => visibleRetailers.value.has(store.retailer)),
);

const centerOnStore = (storeId: string) => {
  const store = props.stores.find((s) => s.id === storeId);
  if (store?.location) {
    map.value?.map?.setCenter({
      lat: store.location.x,
      lng: store.location.y,
    });
  }
};

const selectedStore = computed(() =>
  props.selectedStoreId
    ? props.stores.find((s) => s.id === props.selectedStoreId)
    : null,
);

const findStoreById = (storeId: StoreId) => {
  const [retailer, ...idx] = storeId.split("-");
  const id = idx.join("-");
  return props.stores.find((s) => s.id === id && s.retailer === retailer);
};

const proxyLines = computed(() => {
  const out: {
    from: { lat: number; lng: number };
    to: { lat: number; lng: number };
  }[] = [];

  for (const [storeKey, masterStoreId] of props.proxyMappings.entries()) {
    const store = findStoreById(storeKey);
    if (!store) continue;
    if (!visibleRetailers.value.has(store.retailer)) continue;
    const masterStore = findStoreById(
      formatStoreId(store.retailer, masterStoreId),
    );
    if (store?.location && masterStore?.location) {
      out.push({
        from: { lat: store.location.x, lng: store.location.y },
        to: { lat: masterStore.location.x, lng: masterStore.location.y },
      });
    }
  }

  return out;
});

const localRadius = ref(props.radius);

watch(localRadius, (value) => {
  emit("update:radius", value);
});

defineExpose({
  centerOnStore,
});
</script>

<template>
  <div class="w-full">
    <GoogleMap
      ref="map"
      style="width: 100%; height: 500px"
      :center="{
        lat: -40.9006,
        lng: 174.886,
      }"
      :zoom="10"
      :api-key="apiKey"
      :scrollwheel="true"
      :styles="[
        {
          featureType: 'poi',
          stylers: [{ visibility: 'off' }],
        },
        {
          featureType: 'administrative',
          elementType: 'labels',
          stylers: [{ visibility: 'off' }],
        },
        {
          featureType: 'road',
          // elementType: 'labels',
          stylers: [{ visibility: 'off' }],
        },
        {
          featureType: 'transit',
          elementType: 'labels.icon',
          stylers: [{ visibility: 'off' }],
        },
      ]"
    >
      <Circle
        v-if="selectedStore?.location"
        :options="{
          center: {
            lat: selectedStore.location.x,
            lng: selectedStore.location.y,
          },
          radius: radius * 1000, // convert km to meters
          fillColor: '#ef444433',
          fillOpacity: 0.15,
          strokeColor: '#ef4444',
          strokeWeight: 2,
          strokeOpacity: 0.8,
        }"
      />
      <template v-for="(line, index) in proxyLines" :key="index">
        <Polyline
          :options="{
            path: [line.from, line.to],
            geodesic: true,
            strokeColor: '#2563eb',
            strokeOpacity: 0.6,
            strokeWeight: 2,
            icons: [
              {
                icon: {
                  path: 1,
                },
                offset: '90%',
              },
            ],
          }"
        />
      </template>
      <template v-for="store in filteredStores" :key="store.id">
        <CustomMarker
          v-if="store.location"
          :options="{
            position: {
              lat: store.location.x,
              lng: store.location.y,
            },
          }"
        >
          <div class="relative group">
            <button
              class="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-4 h-4 rounded-full"
              :class="{
                'bg-yellow-400/80': store.retailer === 'pns',
                'bg-pink-500/80': store.retailer === 'nw',
                'bg-green-500/80': store.retailer === 'ww',
                'border-4 border-red-500':
                  store.syncSchedule == null || store.syncSchedule === 'never',
              }"
              @click="$emit('store-click', store)"
            />
            <div
              v-if="store.id === selectedStoreId"
              class="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-12 h-12 rounded-full animate-pulse-ring"
            />
            <div
              class="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block bg-black/75 text-white px-2 py-1 rounded text-sm whitespace-nowrap z-100 pointer-events-none"
            >
              {{ store.name }}
            </div>
          </div>
        </CustomMarker>
      </template>
    </GoogleMap>
    <div class="mt-2 flex items-center justify-between">
      <div class="flex items-center gap-4">
        <!-- eslint-disable-next-line vuejs-accessibility/form-control-has-label -->
        <input
          v-model.number="localRadius"
          type="range"
          min="0.5"
          max="30"
          step="1"
          class="w-48"
        />
        <span class="text-sm text-muted-foreground">{{ radius }}km radius</span>
      </div>

      <div class="flex items-center gap-4">
        <!-- eslint-disable-next-line vuejs-accessibility/label-has-for -->
        <label class="flex items-center gap-2">
          <input
            v-model="visibleRetailers"
            type="checkbox"
            value="ww"
            checked
          />
          <span>Countdown</span>
        </label>

        <!-- eslint-disable-next-line vuejs-accessibility/label-has-for -->
        <label class="flex items-center gap-2">
          <input
            v-model="visibleRetailers"
            type="checkbox"
            value="pns"
            checked
          />
          <span>Pak'nSave</span>
        </label>

        <!-- eslint-disable-next-line vuejs-accessibility/label-has-for -->
        <label class="flex items-center gap-2">
          <input
            v-model="visibleRetailers"
            type="checkbox"
            value="nw"
            checked
          />
          <span>New World</span>
        </label>
      </div>
    </div>
  </div>
</template>

<style scoped>
.animate-pulse-ring {
  border: 2px solid rgba(239, 68, 68, 0.5); /* red-500 with opacity */
  animation: pulse-ring 1.5s cubic-bezier(0.215, 0.61, 0.355, 1) infinite;
}

@keyframes pulse-ring {
  0% {
    transform: translate(-50%, -50%) scale(0.7);
    opacity: 0.9;
  }
  70% {
    opacity: 0.5;
  }
  100% {
    transform: translate(-50%, -50%) scale(1);
    opacity: 0;
  }
}
</style>
