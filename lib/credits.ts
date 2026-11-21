import "server-only";
import { transaction, type Db } from "@/lib/db";
import { env } from "@/lib/env";
import { PipelineError } from "@/lib/pipeline/errors";

/**
 * Supadata credits (Instagram), tracked apart from AI dollars. Like AI spend, each paid call
 * reserves its worst case first, so concurrent jobs can't overshoot the caps; the row is then
 * settled with the credits Supadata actually billed.
 */
const DAY_MS = 86_400_000;

export function creditsUsedSince(db: Db, sinceMs: number, jobId?: string): number {
  const row = db
    .prepare(
      `SELECT COALESCE(SUM(CASE WHEN status = 'reserved' THEN worst_case_credits ELSE COALESCE(credits, 0) END), 0) AS used
       FROM processing_runs WHERE provider = 'supadata' AND created_at > ? ${jobId ? "AND job_id = ?" : ""}`,
    )
    .get(...(jobId ? [sinceMs, jobId] : [sinceMs])) as { used: number };
  return row.used;
}

/** Throws PipelineError("limited") if the call could break a cap. Returns the row id to settle. */
export function reserveCredits(db: Db, input: { jobId: string; stage: string; worstCredits: number; now?: number }): number {
  const now = input.now ?? Date.now();
  const { SUPADATA_DAILY_CREDITS, SUPADATA_MONTHLY_CREDITS, SUPADATA_MAX_JOB_CREDITS } = env();
  return transaction(db, () => {
    const job = creditsUsedSince(db, 0, input.jobId);
    if (job + input.worstCredits > SUPADATA_MAX_JOB_CREDITS) throw new PipelineError("limited", `job would use up to ${job + input.worstCredits} credits (cap ${SUPADATA_MAX_JOB_CREDITS})`);
    const day = creditsUsedSince(db, now - DAY_MS);
    if (day + input.worstCredits > SUPADATA_DAILY_CREDITS) throw new PipelineError("limited", `daily Supadata credits reached (${day} of ${SUPADATA_DAILY_CREDITS})`);
    const month = creditsUsedSince(db, now - 30 * DAY_MS);
    if (month + input.worstCredits > SUPADATA_MONTHLY_CREDITS) throw new PipelineError("limited", `30-day Supadata credits reached (${month} of ${SUPADATA_MONTHLY_CREDITS})`);
    const r = db
      .prepare("INSERT INTO processing_runs (job_id, stage, provider, status, worst_case_credits, created_at) VALUES (?, ?, 'supadata', 'reserved', ?, ?)")
      .run(input.jobId, input.stage, input.worstCredits, now);
    return Number(r.lastInsertRowid);
  });
}
