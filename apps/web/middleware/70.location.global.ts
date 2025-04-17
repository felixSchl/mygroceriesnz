export default defineNuxtRouteMiddleware(async (event) => {
  if (!import.meta.client) return;
  const location = await resolveLocationAsync();
  const cart = useCart();
  if (location) {
    cart.location = location;
  }
});
