export default defineNuxtRouteMiddleware(async (event) => {
  if (event.path.startsWith("/admin")) {
    const user = useUser();
    if (user.value?.role !== "admin") {
      return navigateTo("/signin");
    }
  }
});
