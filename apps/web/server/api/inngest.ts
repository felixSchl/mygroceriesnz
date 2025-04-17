import { serve } from "inngest/h3";

export default defineEventHandler((event) => {
  const app = event.context.app;
  if (!app) throw new Error("App context not loaded");
  return serve(app.inngest)(event);
});
