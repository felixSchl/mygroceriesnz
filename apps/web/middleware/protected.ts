/**
 * Redirects the user to the home page if they are not logged in.
 */
export default defineNuxtRouteMiddleware(async () => {
  const user = useUser();
  if (!user.value || user.value.role === "anon") {
    return navigateTo("/");
  }
});
