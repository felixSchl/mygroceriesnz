<script setup>
import { ref } from "vue";

definePageMeta({
  layout: false,
});

const trpc = useTrpc();
const input = ref("");
const toast = useToast();

const handleSubmit = () => {
  trpc.adminSignIn.mutate({ key: input.value }).then(async (ok) => {
    if (ok) {
      toast.success("Signed in");
      window.location = "/admin";
    } else {
      toast.error("Invalid admin key");
    }
  });
};
</script>
<template>
  <div class="flex min-h-screen items-center justify-center">
    <Card class="w-[450px]">
      <CardHeader>
        <CardTitle>Admin Access</CardTitle>
        <CardDescription>Access the admin dashboard</CardDescription>
      </CardHeader>
      <CardContent>
        <form @submit.prevent="handleSubmit">
          <div class="grid w-full items-center gap-4">
            <div class="flex flex-col space-y-1.5">
              <Input
                id="keyInput"
                v-model="input"
                type="password"
                placeholder="Enter admin key"
              />
            </div>
            <Button type="submit" class="w-full"> Sign In </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  </div>
</template>
