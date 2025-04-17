<script lang="ts" setup>
import { formatStoreId } from "@repo/db/codecs";

defineEmits<{
  (event: "close"): void;
}>();

type Mode = "my-stores" | "find";

const props = defineProps<{
  open: boolean;
}>();

const mode = ref<Mode>("my-stores");

const cart = useCart();
const didRedirect = ref(false);

watch(
  () => props.open,
  () => {
    if (props.open) {
      if (cart.stores.size === 0) {
        didRedirect.value = true;
        mode.value = "find";
        return;
      }
    }
    didRedirect.value = false;
    mode.value = "my-stores";
  },
  {
    immediate: true,
  },
);

const trpc = useTrpc();

const showDiscordInviteModal = ref(false);

function onClickJoinDiscord() {
  window.open("https://discord.gg/SkdC3GCfdx", "_blank");
  showDiscordInviteModal.value = false;
}

const { data: syncDates, refresh } = trpc.getStoresSyncDates.useQuery(
  () => Array.from(cart.stores.keys()),
  {
    server: false,
    immediate: false,
  },
);

const open = computed(() => props.open);
watch([open], () => {
  if (open.value) {
    refresh();
  }
});

const stores = computed(() =>
  cart.selectedStores.map((st) => ({
    ...st,
    lastSyncedAt:
      syncDates.value?.find(
        (d) => d.key === formatStoreId(st.retailer, st.storeId),
      )?.lastSyncedAt || null,
  })),
);
</script>

<template>
  <Dialog
    :open="open"
    @update:open="(v: boolean) => v === false && $emit('close')"
  >
    <DialogContent
      :class="[
        'max-w-screen h-screen flex flex-col rounded-none  gap-0 max-h-[calc(100dvh)]',
        'sm:max-w-[625px] sm:max-h-[80vh] sm:h-fit sm:rounded-lg',
      ]"
      no-close
    >
      <div class="overflow-y-auto">
        <Transition name="fade" mode="out-in">
          <StoreSelectorMyStores
            v-if="mode === 'my-stores'"
            :stores
            @find="mode = 'find'"
            @close="$emit('close')"
          />
          <StoreSelectorFind v-else />
        </Transition>
      </div>

      <DialogFooter
        class="pt-4 z-10 fixed sm:relative bottom-0 w-full left-0 right-0 pb-4 bg-background border-t border-border"
      >
        <Button
          type="submit"
          class="mx-4"
          @click.prevent="
            if (mode === 'find' && !didRedirect) {
              mode = 'my-stores';
            } else {
              $emit('close');
            }
          "
          variant="outline"
        >
          Close
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>

  <!-- Add this new Discord invite dialog -->
  <Dialog :open="showDiscordInviteModal">
    <DialogContent class="sm:max-w-[425px]">
      <DialogHeader>
        <DialogTitle>Join the MyGroceries Discord</DialogTitle>
        <DialogDescription>
          We are onboarding stores around New Zealand based on demand. Please
          join our Discord community to get your store added or flick us an
          email at
          <a href="mailto:hello@mygroceries.nz" class="text-primary"
            >hello@mygroceries.nz</a
          >.
        </DialogDescription>
      </DialogHeader>
      <div class="flex justify-center gap-3">
        <Button variant="secondary" @click="showDiscordInviteModal = false">
          Cancel
        </Button>
        <Button @click="onClickJoinDiscord">Join Discord</Button>
      </div>
    </DialogContent>
  </Dialog>
</template>
