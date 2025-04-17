<script lang="ts" setup>
import { useCart } from "~/stores/cart";

const cart = useCart();

const props = defineProps<{
  open: boolean;
}>();

defineEmits<{
  "update:open": [value: boolean];
}>();

watch(props, ({ open }) => {
  if (!open) return;
  void cart.refreshPrices();
});

const itemIds = computed(() => Array.from(cart.items.keys()));
</script>

<template>
  <Sheet
    :open="open"
    side="right"
    modal
    @update:open="$emit('update:open', $event)"
  >
    <SheetContent class="w-full sm:max-w-lg overflow-y-scroll">
      <SheetHeader>
        <SheetTitle class="mr-auto text-2xl -mt-3"
          >My List
          <Button
            variant="ghost"
            size="icon"
            :disabled="cart.isRefreshingPrices"
            class="ml-1"
            @click="cart.refreshPrices"
          >
            <fa
              v-if="cart.isRefreshingPrices"
              icon="spinner"
              class="animate-spin"
            />
            <fa v-else icon="refresh" />
          </Button>
        </SheetTitle>
        <SheetDescription class="mr-auto">
          {{ cart.items.size }} items from {{ cart.stores.size }} store{{
            cart.stores.size === 1 ? "" : "s"
          }}
        </SheetDescription>
      </SheetHeader>

      <div class="flex flex-col gap-4 my-4">
        <!-- Cart items will go here -->
        <div
          v-if="cart.totalItemCount === 0"
          class="text-center py-8 text-muted-foreground"
        >
          Your list is empty
        </div>

        <div v-else class="space-y-4">
          <div
            v-if="!cart.hasLoadedPrices"
            class="text-center py-8 text-muted-foreground"
          >
            Refreshing prices...
          </div>
          <template v-else>
            <template v-if="itemIds.length === 0">
              <div class="text-center py-8 text-muted-foreground">
                Cart is empty
              </div>
            </template>
            <template v-else>
              <CartDrawerItem
                v-for="itemId in itemIds"
                :key="itemId"
                :product-id="itemId"
              />
            </template>
          </template>
        </div>
      </div>

      <SheetFooter>
        <div class="w-full space-y-4 mt-8">
          <Button class="w-full" size="lg" @click="$emit('update:open', false)"
            >Close</Button
          >
        </div>
      </SheetFooter>
    </SheetContent>
  </Sheet>
</template>
