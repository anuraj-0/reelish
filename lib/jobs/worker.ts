import "server-only";
import type { Db } from "@/lib/db";
import { log } from "@/lib/log";
import { isAbortError, PipelineError } from "@/lib/pipeline/errors";
import { runYoutubeJob, type JobContext } from "@/lib/pipeline/youtube";
import { claimNextJob, completeJob, failJob, heartbeat, readStages, recoverStaleJobs, requeueJob, setStageState, type JobRow } from "./store";

/**
 * The background worker (decision D8): a separate process that polls the jobs table.
 * HTTP requests only create jobs; nothing here depends on a browser staying connected.
 */
export const WORKER = {
  concurrency: 2,
  pollMs: 1_000,
  heartbeatMs: 5_000,
  /** No heartbeat for this long: the worker died, recover the job. */
  staleMs: 30_000,
  recoverEveryMs: 15_000,
  /** Whole-job cap; individual calls have their own, shorter timeouts. */
  jobTimeoutMs: 180_000,
  retryBackoffMs: 5_000,
};

export type RunJob = (ctx: JobContext) => Promise<string>;

/** Runs one claimed job to completion, failure, or an automatic retry. Never throws. */
export async function processJob(db: Db, job: JobRow, opts: { run?: RunJob; shutdown?: AbortSignal; jobTimeoutMs?: number; transport?: JobContext["transport"] } = {}) {
  const run = opts.run ?? runYoutubeJob;
  const timeout = AbortSignal.timeout(opts.jobTimeoutMs ?? WORKER.jobTimeoutMs);
  const signal = opts.shutdown ? AbortSignal.any([timeout, opts.shutdown]) : timeout;
  const beat = setInterval(() => heartbeat(db, job.id), WORKER.heartbeatMs);
  const started = Date.now();
  log("job_started", { jobId: job.id, key: job.video_key, attempt: job.attempts });
  try {
    const recipeId = await run({ db, job, signal, setStage: (key, state) => setStageState(db, job.id, key, state), transport: opts.transport });
    completeJob(db, job.id, recipeId);
    log("job_succeeded", { jobId: job.id, recipeId, ms: Date.now() - started, attempt: job.attempts });
  } catch (e) {
    if (opts.shutdown?.aborted) {
      // Leave it "running"; stale-job recovery picks it up after the restart.
      log("job_interrupted", { jobId: job.id }, "warn");
      return;
    }
    const err =
      e instanceof PipelineError
        ? e
        : isAbortError(e)
          ? new PipelineError("upstream_failed", "job timed out", { retryable: true })
          : new PipelineError("upstream_failed", `unexpected error: ${(e as Error)?.message ?? String(e)}`, { retryable: false, cause: e });
    // Mark whichever stage was in progress as failed so the UI shows where it stopped.
    const current = db.prepare("SELECT stages FROM jobs WHERE id = ?").get(job.id) as { stages: string } | undefined;
    const active = current ? readStages(current).find((s) => s.state === "active") : undefined;
    if (err.retryable && job.attempts < job.max_attempts) {
      const runAfter = Date.now() + WORKER.retryBackoffMs * job.attempts + Math.floor(Math.random() * 1_000);
      requeueJob(db, job.id, runAfter);
      log("job_retry_scheduled", { jobId: job.id, code: err.code, message: err.message, attempt: job.attempts, inMs: runAfter - Date.now() }, "warn");
    } else {
      if (active) setStageState(db, job.id, active.key, "failed");
      failJob(db, job.id, err.code);
      log("job_failed", { jobId: job.id, code: err.code, message: err.message, ms: Date.now() - started, attempt: job.attempts }, err.code === "upstream_failed" ? "error" : "info");
    }
  } finally {
    clearInterval(beat);
  }
}

export function startWorker(db: Db, opts: { run?: RunJob } = {}) {
  const shutdown = new AbortController();
  const active = new Set<Promise<void>>();
  let stopping = false;

  const recover = () => {
    const r = recoverStaleJobs(db, WORKER.staleMs);
    if (r.requeued.length || r.failed.length) log("jobs_recovered", r, "warn");
  };
  recover();
  const recoverTimer = setInterval(recover, WORKER.recoverEveryMs);

  const loop = async () => {
    while (!stopping) {
      while (!stopping && active.size < WORKER.concurrency) {
        const job = claimNextJob(db);
        if (!job) break;
        const p = processJob(db, job, { run: opts.run, shutdown: shutdown.signal }).finally(() => active.delete(p));
        active.add(p);
      }
      await new Promise((r) => setTimeout(r, WORKER.pollMs));
    }
  };
  const done = loop();
  log("worker_started", { concurrency: WORKER.concurrency });

  return {
    /** Stop claiming; give running jobs `graceMs` to finish, then abort them (they're recovered later). */
    async stop(graceMs = 20_000) {
      stopping = true;
      clearInterval(recoverTimer);
      await done;
      const all = Promise.all(active);
      const timer = setTimeout(() => shutdown.abort(), graceMs);
      await all;
      clearTimeout(timer);
      log("worker_stopped", {});
    },
  };
}
