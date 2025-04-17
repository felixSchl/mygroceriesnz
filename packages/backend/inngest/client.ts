import type { DBClient } from "@repo/db";
import { Inngest, InngestMiddleware } from "inngest";
import type { SearchClient } from "../search/index.js";
import { schemas } from "./types.js";

type Notification =
  | {
      type: "JOB_STARTED";
      jobTitle: string;
      jobId: string;
      runId: string;
    }
  | {
      type: "JOB_FAILED";
      jobTitle: string;
      jobId: string;
      runId: string;
      error: string;
    }
  | {
      type: "JOB_CANCELLED";
      jobTitle: string;
      jobId: string;
      runId: string;
    }
  | {
      type: "JOB_COMPLETED";
      jobTitle: string;
      jobId: string;
      runId: string;
    };

export type GetContext<T> = (...reqArgs: T[]) => {
  db: DBClient;
  search: SearchClient;
  notify: (notification: Notification) => Promise<void>;
};

export const createInngestClient = <T>(getContext: GetContext<T>) =>
  // TODO accept a fn that gets the DBClient off the context
  new Inngest({
    id: "inngest",
    schemas,
    middleware: [
      new InngestMiddleware({
        name: "Install Context",
        init: async () => {
          return {
            onFunctionRun: async ({ reqArgs }) => {
              return {
                transformInput: async (input) => {
                  return {
                    ...input,
                    ctx: {
                      ctx: getContext(...(reqArgs as T[])),
                    },
                  };
                },
              };
            },
          };
        },
      }),
    ],
  });

export type InngestClient = ReturnType<typeof createInngestClient>;
