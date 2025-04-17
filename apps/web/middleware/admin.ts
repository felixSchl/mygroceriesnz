/**
 * Redirects the user to the home page if they are not logged in as an admin.
 */
export default defineNuxtRouteMiddleware(async () => {
  const user = useUser();
  if (user.value?.role !== "admin") {
    return navigateTo("/");
  }
});
