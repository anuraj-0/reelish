import "server-only";
import { transaction, type Db } from "@/lib/db";
import { redact } from "@/lib/log";
import { Recipe } from "@/lib/recipe/schema";
import type { ParsedVideoUrl } from "@/lib/url";
import { JobErrorCode, type JobStatus, type StageKey } from "./types";

/** Bump to reprocess videos lazily after a pipeline change (old recipes stay readable). */
export const PIPELINE_VERSION = "yt-1";
export const MAX_ATTEMPTS = 2;

export type StageState = JobStatus["stages"][number]["state"];
export type JobRow = {
  id: string;
  video_key: string;
  platform: "youtube" | "instagram";
  video_id: string;
  url: string;
  pipeline_version: string;
  status: "queued" | "running" | "succeeded" | "failed";
  stages: string;
  attempts: number;
  max_attempts: number;
  error_code: string | null;
  recipe_id: string | null;
  client_hash: string | null;
  created_at: number;
  run_after: number;
  started_at: number | null;
  heartbeat_at: number | null;
  finished_at: number | null;
};

export function insertJob(db: Db, input: { parsed: ParsedVideoUrl; stages: StageKey[]; clientHash: string | null; now?: number }): string {
  const now = input.now ?? Date.now();
  const id = crypto.randomUUID();
  db.prepare(
    `INSERT INTO jobs (id, video_key, platform, video_id, url, pipeline_version, status, stages, attempts, max_attempts, client_hash, created_at, run_after)
     VALUES (?, ?, ?, ?, ?, ?, 'queued', ?, 0, ?, ?, ?, ?)`,
  ).run(
    id,
    input.parsed.key,
    input.parsed.platform,
    input.parsed.videoId,
    input.parsed.canonicalUrl,
    PIPELINE_VERSION,
    JSON.stringify(input.stages.map((key) => ({ key, state: "pending" }))),
    MAX_ATTEMPTS,
    input.clientHash,
    now,
    now,
  );
  return id;
}

export function getJob(db: Db, id: string): JobRow | null {
  return (db.prepare("SELECT * FROM jobs WHERE id = ?").get(id) as JobRow | undefined) ?? null;
}

export function findActiveJob(db: Db, videoKey: string): JobRow | null {
  return (db.prepare("SELECT * FROM jobs WHERE video_key = ? AND status IN ('queued', 'running')").get(videoKey) as JobRow | undefined) ?? null;
}

/**
 * A recent failure worth showing again instead of paying to rediscover it:
 * not a recipe / too long (stable, 24 h) and unavailable (may change, 1 h).
 */
export function findReusableFailure(db: Db, videoKey: string, now = Date.now()): JobRow | null {
  return (
    (db
      .prepare(
        `SELECT * FROM jobs WHERE video_key = ? AND pipeline_version = ? AND status = 'failed' AND (
           (error_code IN ('not_a_recipe', 'too_long') AND finished_at > ?) OR (error_code = 'unavailable' AND finished_at > ?)
         ) ORDER BY finished_at DESC LIMIT 1`,
      )
      .get(videoKey, PIPELINE_VERSION, now - 86_400_000, now - 3_600_000) as JobRow | undefined) ?? null
  );
}

export function countRecentJobsByClient(db: Db, clientHash: string, sinceMs: number, now = Date.now()): number {
  return (db.prepare("SELECT COUNT(*) AS n FROM jobs WHERE client_hash = ? AND created_at > ?").get(clientHash, now - sinceMs) as { n: number }).n;
}

/** Atomically takes the oldest runnable job. Safe with several workers. */
export function claimNextJob(db: Db, now = Date.now()): JobRow | null {
  return (
    (db
      .prepare(
        `UPDATE jobs SET status = 'running', attempts = attempts + 1, started_at = ?, heartbeat_at = ?
         WHERE id = (SELECT id FROM jobs WHERE status = 'queued' AND run_after <= ? ORDER BY created_at LIMIT 1) AND status = 'queued'
         RETURNING *`,
      )
      .get(now, now, now) as JobRow | undefined) ?? null
  );
}

export function heartbeat(db: Db, id: string, now = Date.now()) {
  db.prepare("UPDATE jobs SET heartbeat_at = ? WHERE id = ? AND status = 'running'").run(now, id);
}

export function readStages(row: Pick<JobRow, "stages">): { key: StageKey; state: StageState }[] {
  return JSON.parse(row.stages);
}

export function setStageState(db: Db, id: string, key: StageKey, state: StageState) {
  transaction(db, () => {
    const row = db.prepare("SELECT stages FROM jobs WHERE id = ?").get(id) as { stages: string } | undefined;
    if (!row) return;
    const stages = readStages(row).map((s) => (s.key === key ? { ...s, state } : s));
    db.prepare("UPDATE jobs SET stages = ? WHERE id = ?").run(JSON.stringify(stages), id);
  });
}

export function completeJob(db: Db, id: string, recipeId: string, now = Date.now()) {
  db.prepare("UPDATE jobs SET status = 'succeeded', recipe_id = ?, finished_at = ?, error_code = NULL WHERE id = ?").run(recipeId, now, id);
}

export function failJob(db: Db, id: string, code: JobErrorCode, now = Date.now()) {
  db.prepare("UPDATE jobs SET status = 'failed', error_code = ?, finished_at = ? WHERE id = ?").run(code, now, id);
}

/** Back to the queue for an automatic retry; finished stages stay finished (their outputs are cached). */
export function requeueJob(db: Db, id: string, runAfter: number) {
  transaction(db, () => {
    const row = db.prepare("SELECT stages FROM jobs WHERE id = ?").get(id) as { stages: string } | undefined;
    const stages = row ? readStages(row).map((s) => (s.state === "done" ? s : { ...s, state: "pending" as const })) : [];
    db.prepare("UPDATE jobs SET status = 'queued', run_after = ?, heartbeat_at = NULL, stages = ? WHERE id = ?").run(runAfter, JSON.stringify(stages), id);
  });
}

/**
 * Jobs whose worker vanished (crash, kill, deploy): no heartbeat for `staleMs`.
 * Requeued if they have attempts left, otherwise failed.
 */
export function recoverStaleJobs(db: Db, staleMs: number, now = Date.now()): { requeued: string[]; failed: string[] } {
  return transaction(db, () => {
    const stale = db.prepare("SELECT id, attempts, max_attempts FROM jobs WHERE status = 'running' AND heartbeat_at < ?").all(now - staleMs) as Pick<
      JobRow,
      "id" | "attempts" | "max_attempts"
    >[];
    const requeued: string[] = [];
    const failed: string[] = [];
    for (const job of stale) {
      if (job.attempts < job.max_attempts) {
        db.prepare("UPDATE jobs SET status = 'queued', run_after = ?, heartbeat_at = NULL WHERE id = ?").run(now, job.id);
        requeued.push(job.id);
      } else {
        db.prepare("UPDATE jobs SET status = 'failed', error_code = 'upstream_failed', finished_at = ? WHERE id = ?").run(now, job.id);
        failed.push(job.id);
      }
    }
    return { requeued, failed };
  });
}

export function toJobStatus(row: JobRow): JobStatus {
  const code = JobErrorCode.safeParse(row.error_code);
  return {
    id: row.id,
    platform: row.platform,
    sourceUrl: row.url,
    // A job waiting for an automatic retry is shown as still working.
    status: row.status === "queued" && row.attempts > 0 ? "running" : row.status,
    stages: readStages(row),
    startedAt: new Date(row.created_at).toISOString(),
    recipeId: row.status === "succeeded" ? row.recipe_id : null,
    error: row.status === "failed" ? (code.success ? code.data : "upstream_failed") : null,
  };
}

// ---- Recipes --------------------------------------------------------------------------------

export function saveRecipe(db: Db, recipe: Recipe, videoKey: string, now = Date.now()) {
  db.prepare("INSERT INTO recipes (id, video_key, pipeline_version, data, created_at) VALUES (?, ?, ?, ?, ?)").run(
    recipe.id,
    videoKey,
    recipe.extraction.pipelineVersion,
    JSON.stringify(recipe),
    now,
  );
}

export function getStoredRecipe(db: Db, id: string): Recipe | null {
  const row = db.prepare("SELECT data FROM recipes WHERE id = ?").get(id) as { data: string } | undefined;
  if (!row) return null;
  const parsed = Recipe.safeParse(JSON.parse(row.data));
  return parsed.success ? parsed.data : null;
}

export function findRecipeIdForVideo(db: Db, videoKey: string): string | null {
  const row = db
    .prepare("SELECT id FROM recipes WHERE video_key = ? AND pipeline_version = ? ORDER BY created_at DESC LIMIT 1")
    .get(videoKey, PIPELINE_VERSION) as { id: string } | undefined;
  return row?.id ?? null;
}

// ---- Processing runs ------------------------------------------------------------------------

export type RunFields = {
  status: "ok" | "error" | "cached" | "skipped";
  provider: string;
  model?: string | null;
  errorCode?: string | null;
  latencyMs?: number | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  costUsd?: number | null;
  detail?: unknown;
};

/** Inserts a run, or settles a reserved one (budget.reserveSpend) when `reservedId` is given. */
export function recordRun(db: Db, jobId: string, stage: string, f: RunFields, reservedId?: number, now = Date.now()) {
  const detail = f.detail === undefined ? null : redact(JSON.stringify(f.detail)).slice(0, 4000);
  if (reservedId !== undefined) {
    db.prepare(
      `UPDATE processing_runs SET status = ?, error_code = ?, latency_ms = ?, input_tokens = ?, output_tokens = ?, cost_usd = ?, model = COALESCE(?, model), detail = ? WHERE id = ?`,
    ).run(f.status, f.errorCode ?? null, f.latencyMs ?? null, f.inputTokens ?? null, f.outputTokens ?? null, f.costUsd ?? null, f.model ?? null, detail, reservedId);
    return;
  }
  db.prepare(
    `INSERT INTO processing_runs (job_id, stage, provider, model, status, error_code, latency_ms, input_tokens, output_tokens, cost_usd, detail, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(jobId, stage, f.provider, f.model ?? null, f.status, f.errorCode ?? null, f.latencyMs ?? null, f.inputTokens ?? null, f.outputTokens ?? null, f.costUsd ?? null, detail, now);
}
