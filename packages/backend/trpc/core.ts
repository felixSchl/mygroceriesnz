import { DBClient, type Retailer } from "@repo/db";
import { TRPCError, initTRPC } from "@trpc/server";
import SuperJSON from "superjson";
import { z } from "zod";
import type { InngestClient } from "../inngest/client.js";
import type { SearchClient } from "../search/index.js";

type User = {
  role: "anon" | "user" | "admin";
};

export type Context = {
  config: {
    apiKey: string;
  };
  isProduction: boolean;
  db: DBClient;
  search: SearchClient;
  inngest: InngestClient;
  discord: {
    applicationId: string;
    botToken: string;
  };
  user: User | null;

  // TEMP
  adminSignIn: (key: string) => Promise<boolean>;
};

const t = initTRPC.context<Context>().create({
  transformer: SuperJSON,
  errorFormatter(opts) {
    const ctx = opts.ctx;
    const { shape, error } = opts;
    if (error.code === "INTERNAL_SERVER_ERROR") {
      console.error("[E]Internal server error:", error);
    }
    return {
      ...shape,
      message:
        error.code === "INTERNAL_SERVER_ERROR" && ctx?.isProduction
          ? "Internal server error"
          : error.message,
      data: {
        ...shape.data,
        stack: ctx?.isProduction ? null : error.stack,
        zodError:
          error.code === "BAD_REQUEST" && error.cause instanceof z.ZodError
            ? error.cause.flatten()
            : null,
      },
    };
  },
});

export const router = t.router;

export const publicProcedure = t.procedure;

export const protectedProcedure = t.procedure.use(async (opts) => {
  const { ctx } = opts;
  if (!ctx.user) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Unauthorized",
    });
  }
  return opts.next({
    ctx: {
      user: ctx.user,
    },
  });
});

export const adminProcedure = t.procedure.use(async (opts) => {
  if (!opts.ctx.user?.role?.includes("admin")) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Unauthorized",
    });
  }
  return opts.next({
    ctx: opts.ctx,
  });
});
