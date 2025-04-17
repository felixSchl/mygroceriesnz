<script lang="ts" setup>
definePageMeta({ layout: "admin" });

const trpc = useTrpc();
const toast = useToast();

const { mutate: registerDiscordCommandsImpl, status } =
  trpc.admin.registerDiscordCommands.useMutation();

async function registerDiscordCommands() {
  try {
    await registerDiscordCommandsImpl();
  } catch (error) {
    toast.error("Error registering discord commands; see console for details");
    console.error(error);
    return;
  }
  toast.success("Discord commands registered");
}
</script>

<template>
  <div>
    <h1 class="text-2xl font-bold">Discord</h1>

    <div class="flex flex-col mt-8">
      <Button
        :disabled="status === 'pending'"
        class="w-fit"
        @click="registerDiscordCommands"
      >
        Register Discord Commands
        <Transition name="fade" mode="out-in">
          <fa v-if="status === 'pending'" icon="spinner" class="animate-spin" />
        </Transition>
      </Button>
    </div>
  </div>
</template>
