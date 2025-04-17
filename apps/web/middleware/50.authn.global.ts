export default defineNuxtRouteMiddleware(async () => {
  if (import.meta.client) return;
  const user = useUser();
  const event = useRequestEvent();
  user.value = event?.context.user ?? null;
});
