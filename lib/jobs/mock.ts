import "server-only";
import { findFixtureByKey } from "@/lib/fixtures";
import type { ParsedVideoUrl } from "@/lib/url";
import type { JobErrorCode, JobStatus, StageKey } from "./types";

/**
 * M1 stand-in for the real job queue. Jobs "run" on a timer against the saved
 * test recipes so we can design the waiting and failure experience. Replaced by the
 * persisted jobs table + worker in M2. Not a model of real latency: Instagram runs
 * are shortened (~10 s here vs 25–50 s live).
 */

/** The fake id that demonstrates a private/removed video. */
export const DEMO_UNAVAILABLE_ID = "privateDemo";

const STAGE_MS: Record<StageKey, number> = {
  metadata: 1200,
  caption: 1400,
  linked_recipe: 1600,
  video: 2600,
  transcript: 3200,
  visual: 2400,
  normalize: 1800,
};

type MockJob = {
  id: string;
  createdAt: number;
  parsed: ParsedVideoUrl;
  stages: StageKey[];
  recipeId: string | null;
  /** If set, the job fails when it reaches this stage. */
  failAt: { stage: StageKey; error: JobErrorCode } | null;
};

const store: Map<string, MockJob> = ((globalThis as { __reelishMockJobs?: Map<string, MockJob> }).__reelishMockJobs ??= new Map());

export function createMockJob(parsed: ParsedVideoUrl): string {
  const fixture = findFixtureByKey(parsed.key);
  const first: StageKey = parsed.platform === "youtube" ? "metadata" : "caption";
  let job: Omit<MockJob, "id" | "createdAt">;
  if (fixture) {
    job = { parsed, stages: fixture.extraction.stages as StageKey[], recipeId: fixture.id, failAt: null };
  } else if (parsed.videoId === DEMO_UNAVAILABLE_ID) {
    job = { parsed, stages: [first, "linked_recipe", "video", "normalize"], recipeId: null, failAt: { stage: first, error: "unavailable" } };
  } else {
    job = { parsed, stages: [first], recipeId: null, failAt: { stage: first, error: "preview_only" } };
  }
  const id = crypto.randomUUID();
  store.set(id, { ...job, id, createdAt: Date.now() });
  return id;
}

export function getMockJob(id: string, now = Date.now()): JobStatus | null {
  const job = store.get(id);
  if (!job) return null;
  const elapsed = now - job.createdAt;

  let t = 0;
  let status: JobStatus["status"] = "succeeded";
  let error: JobErrorCode | null = null;
  const stages = job.stages.map((key) => {
    const start = t;
    t += STAGE_MS[key];
    if (status !== "succeeded") return { key, state: "pending" as const };
    if (job.failAt?.stage === key && elapsed >= start + 900) {
      status = "failed";
      error = job.failAt.error;
      return { key, state: "failed" as const };
    }
    if (elapsed >= t && job.failAt?.stage !== key) return { key, state: "done" as const };
    status = "running";
    return { key, state: elapsed >= start ? ("active" as const) : ("pending" as const) };
  });

  return {
    id: job.id,
    platform: job.parsed.platform,
    sourceUrl: job.parsed.canonicalUrl,
    status,
    stages,
    startedAt: new Date(job.createdAt).toISOString(),
    recipeId: status === "succeeded" ? job.recipeId : null,
    error,
  };
}
