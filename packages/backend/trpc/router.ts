import type { inferRouterOutputs } from "@trpc/server";
import { adminRouter } from "./admin.js";
import { router } from "./core.js";
import { publicRouter } from "./public.js";
import { userRouter } from "./user.js";

export const appRouter = router({
  ...publicRouter,
  user: userRouter,
  admin: adminRouter,
});

export type AppRouter = typeof appRouter;

export type ProductInfo = inferRouterOutputs<AppRouter>["productInfo"];
export type SearchHit = inferRouterOutputs<AppRouter>["search"]["hits"][number];
export type PriceData = NonNullable<ProductInfo>["prices"][number];

export type ProductData = NonNullable<
  inferRouterOutputs<AppRouter>["productInfo"]
>;
