<script lang="ts" setup>
import { formatStoreId } from "@repo/db/codecs";
import { formatDistanceToNow } from "date-fns";
import type { SelectedStore } from "~/stores/cart";

defineProps<{
  stores: (SelectedStore & {
    lastSyncedAt: Date | null;
  })[];
}>();

defineEmits<{
  (event: "find"): void;
  (event: "close"): void;
}>();

const cart = useCart();
</script>

<template>
  <div
    class="sticky top-0 z-10 bg-background transition-shadow duration-200 pb-0 mb-0 flex-1"
  >
    <DialogHeader class="h-fit border-b mb-2">
      <DialogTitle class="flex justify-between items-center text-2xl mb-4 p-2">
        <span>My Stores</span>

        <Button
          variant="ghost"
          @click="$emit('find')"
          class="text-blue-500 font-bold tracking-wide"
        >
          FIND
        </Button>
      </DialogTitle>
    </DialogHeader>

    <ScrollArea type="scroll" class="flex-1 min-h-0 overflow-y-auto p-2">
      <template v-if="stores.length === 0">
        <div class="flex flex-col gap-y-2 my-12">
          <div
            class="text-2xl text-muted-foreground text-center tracking-tight mb-2"
          >
            No stores selected
          </div>

          <div class="text-muted-foreground text-center text-sm mb-2">
            Get started by finding your local stores.
          </div>

          <Button
            size="lg"
            class="w-fit mx-auto uppercase font-bold tracking-wide mt-2"
            @click="$emit('find')"
          >
            <fa icon="search" />
            Find Stores
          </Button>
        </div>
      </template>
      <template v-else>
        <div class="flex flex-col gap-y-2 my-4">
          <TransitionGroup name="fade">
            <div
              class="rounded-lg shadow border border-border card-bg p-3"
              v-for="store in stores"
              :key="formatStoreId(store.retailer, store.storeId)"
              @click="
                () => {
                  cart.removeStore(
                    formatStoreId(store.retailer, store.storeId),
                  );
                }
              "
            >
              <div class="flex gap-2">
                <RetailerIcon :retailer="store.retailer" class="w-6 h-6" />
                <div class="flex flex-col gap-2">
                  <div class="text-sm font-bold">{{ store.name }}</div>
                  <div class="text-xs text-muted-foreground">
                    <template v-if="store.lastSyncedAt">
                      Last updated
                      {{ formatDistanceToNow(store.lastSyncedAt) }} ago
                    </template>
                  </div>
                </div>
                <div class="flex-1 flex items-center justify-end mr-1">
                  <Checkbox :checked="true" />
                </div>
              </div>
            </div>
          </TransitionGroup>
        </div>
      </template>
    </ScrollArea>
  </div>
</template>
