import {
  NonRetriableError,
  type GetEvents,
  type GetFunctionInput,
  type TimeStr,
} from "inngest";
import { type InngestClient } from "../client.js";
import lateBind from "./late-bind.js";
import type { InngestContext } from "../index.js";

type Events = GetEvents<InngestClient>;

type SupportedJobs = {
  [K in keyof Events]: K extends `${infer T}.requested` ? T : never;
}[keyof Events];

export type Job<T extends SupportedJobs, O> = ReturnType<
  ReturnType<typeof createJob<T, O>>
>;

export function createJob<T extends SupportedJobs, O>(
  params: {
    fn: T;
    internal?: boolean;
    toJobId?: (args: Events[`${T}.requested`]) => string;
    toJobTitle?: (
      args: Events[`${T}.requested`],
      ctx: InngestContext
    ) => Promise<string>;
    toJobIdCLE?: string;
    rateLimit?: {
      period: TimeStr;
      limit: number;
    };
    options?: Omit<
      Parameters<InngestClient["createFunction"]>[0],
      "id" | "cancelOn" | "onFailure"
    >;
  },
  run: (
    args: GetFunctionInput<InngestClient, `${T}.requested`> & {
      inngest: InngestClient;
      jobId: string;
    }
  ) => Promise<O>
) {
  function getJobId(event: Events[`${T}.requested`]) {
    if (!params.toJobId) return params.fn;
    return params.fn + ":" + params.toJobId(event);
  }

  function getJobTitle(event: Events[`${T}.requested`], ctx: InngestContext) {
    if (!params.toJobTitle) return params.fn;
    return params.toJobTitle(event, ctx);
  }

  const jobIdCLE = params.toJobIdCLE
    ? `("${params.fn}:" + (${params.toJobIdCLE}))`
    : `"${params.fn}"`;

  return lateBind((inngest) => ({
    run: inngest.createFunction(
      {
        ...params.options,
        id: params.fn,
        ...(params.rateLimit
          ? {
              rateLimit: {
                limit: params.rateLimit.limit,
                period: params.rateLimit.period,
                key: jobIdCLE,
              },
            }
          : {}),
        onFailure: async ({ ctx, event }) => {
          // derive the jobId from the event data
          const jobId = getJobId(event as any);
          const jobTitle = await getJobTitle(event as any, ctx);

          // mark the job as failed
          await ctx.db.updateJob(jobId, {
            status: "FAILED",
            endedAt: new Date(),
          });

          // let the mods know!
          if (!params.internal) {
            await ctx.notify({
              type: "JOB_FAILED",
              jobId,
              jobTitle: jobTitle,
              runId: event.data.run_id,
              error: event.data.error.message,
            });
          }
        },
        cancelOn: [
          {
            event: `job.cancellation_requested`,
            if: `
              async.data.jobId == ${jobIdCLE} &&
                (async.data.parentJobId == null ||
                  event.data.parentJobId == async.data.parentJobId)`,
          },
        ],
      },
      {
        event: `${params.fn}.requested`,
      },
      async (args) => {
        const { step, event, runId, ctx } = args;

        // derive the jobId from the event data
        const jobId = getJobId(event as any);
        const jobTitle = await getJobTitle(event as any, ctx);

        await step.run("update-job(start)", async () => {
          // check if we're already running this id & abort
          const existingJob = await ctx.db.getJob(jobId);
          if (existingJob?.status === "RUNNING") {
            console.log(`Job ${jobId} is already running, skipping`);
            throw new NonRetriableError("Job already running");
          }

          await ctx.db.upsertJob(jobId, {
            status: "RUNNING",
            startedAt: new Date(),
            parentJobId: event.data.parentJobId ?? null,
            endedAt: null,
            title: jobTitle,
            inngestFn: params.fn,
            inngestRunId: runId,
            inngestEventId: event.id,
            discordMessageId: null, // reset
          });

          if (!params.internal) {
            await ctx.notify({
              type: "JOB_STARTED",
              jobId,
              jobTitle,
              runId,
            });
          }
        });

        // implementation
        await run({
          ...args,
          inngest,
          jobId,
        });

        // mark the job as completed
        // note we do not need try/catch here because we have onFailure and the
        // cancel function to handle errors.
        await step.run("update-job(complete)", async () => {
          await ctx.db.upsertJob(jobId, {
            status: "COMPLETED",
            endedAt: new Date(),
            inngestFn: params.fn,
            inngestRunId: runId,
            inngestEventId: event.id,
            title: jobTitle,
          });

          // let the mods know!
          if (!params.internal) {
            await ctx.notify({
              type: "JOB_COMPLETED",
              jobId,
              jobTitle,
              runId,
            });
          }
        });
      }
    ),
  }));
}

export const requestJobCancellation = lateBind((inngest) =>
  inngest.createFunction(
    {
      id: "cancel-job",
    },
    { event: "job.cancellation_requested" },
    async ({ ctx, event }) => {
      // mark job as cancelled
      const jobId = event.data.jobId;
      const job = await ctx.db.updateJob(jobId, {
        status: "CANCELLED",
        endedAt: new Date(),
      });

      // find all jobs we've spawned
      const childrenJobs = await ctx.db.getRunningChildrenJobs({
        parentJobId: jobId,
      });

      // cancel each job
      for (const childJob of childrenJobs) {
        // send a cancellation callback to the job
        await inngest.send({
          name: "job.cancellation_requested",
          data: { jobId: childJob.id, parentJobId: jobId },
        });
      }

      // let the mods know!
      if (job?.inngestRunId) {
        await ctx.notify({
          type: "JOB_CANCELLED",
          jobId,
          jobTitle: job.title ?? job.inngestFn,
          runId: job.inngestRunId,
        });
      }
    }
  )
);
