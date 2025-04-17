export default defineEventHandler(async (event) => {
  if (import.meta.prerender) {
    event.context.user = {
      role: "anon",
    };
    // pre-render does not need auth; skip
    return;
  }

  // default user context (anonymous)
  event.context.user = {
    role: "anon",
  };

  // TODO authenticate with SuperTokens here.
  // ...

  // admin user context
  const config = useRuntimeConfig();
  const sessionCookie = getCookie(event, "tmp_session");
  if (sessionCookie && sessionCookie === config.shopster.adminKey) {
    event.context.user.role = "admin";
  }
});
