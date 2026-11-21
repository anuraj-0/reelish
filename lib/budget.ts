import "server-only";
import { transaction, type Db } from "@/lib/db";
import { env } from "@/lib/env";
import { PipelineError } from "@/lib/pipeline/errors";

/**
 * Cost model for the one model we call (OpenRouter price list for google/gemini-3.5-flash-lite,
 * checked in the spike: billed cost matched these prices exactly).
 */
export const MODEL = "google/gemini-3.5-flash-lite";
export const PRICE_IN_PER_TOKEN = 0.3e-6;
export const PRICE_OUT_PER_TOKEN = 2.5e-6;
/** Upper bound: 280 tokens/frame at high resolution, 1 fps, plus audio. The spike measured ~95/s. */
export const WORST_VIDEO_TOKENS_PER_SEC = 305;
export const PROMPT_TOKENS_WORST = 3000;
/** Caps reasoning plus visible output together. */
export const MAX_OUTPUT_TOKENS = 6000;

export function worstCaseUsd({ videoSeconds, textChars }: { videoSeconds: number; textChars: number }): number {
  const tokensIn = videoSeconds * WORST_VIDEO_TOKENS_PER_SEC + PROMPT_TOKENS_WORST + Math.ceil(textChars / 3);
  return tokensIn * PRICE_IN_PER_TOKEN + MAX_OUTPUT_TOKENS * PRICE_OUT_PER_TOKEN;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** AI spend in the last 24 h. Reserved-but-unsettled calls count at their worst case. */
export function spentLast24h(db: Db, now = Date.now()): number {
  const row = db
    .prepare(
      `SELECT COALESCE(SUM(CASE WHEN status = 'reserved' THEN worst_case_usd ELSE COALESCE(cost_usd, 0) END), 0) AS spent
       FROM processing_runs WHERE provider = 'openrouter' AND created_at > ?`,
    )
    .get(now - DAY_MS) as { spent: number };
  return row.spent;
}

/**
 * Reserve the worst case of an AI call before making it. Atomic, so two jobs running at
 * once can't both squeeze under the cap. Returns the processing_runs row id to settle.
 */
export function reserveSpend(db: Db, input: { jobId: string; stage: string; worstCaseUsd: number; now?: number }): number {
  const now = input.now ?? Date.now();
  const { DAILY_AI_BUDGET_USD, MAX_JOB_COST_USD } = env();
  return transaction(db, () => {
    if (input.worstCaseUsd > MAX_JOB_COST_USD) {
      throw new PipelineError("limited", `worst case ${input.worstCaseUsd.toFixed(4)} USD exceeds per-call cap ${MAX_JOB_COST_USD} USD`);
    }
    const spent = spentLast24h(db, now);
    if (spent + input.worstCaseUsd > DAILY_AI_BUDGET_USD) {
      throw new PipelineError("limited", `daily AI budget reached (${spent.toFixed(4)} of ${DAILY_AI_BUDGET_USD} USD)`);
    }
    const result = db
      .prepare(
        `INSERT INTO processing_runs (job_id, stage, provider, model, status, worst_case_usd, created_at)
         VALUES (?, ?, 'openrouter', ?, 'reserved', ?, ?)`,
      )
      .run(input.jobId, input.stage, MODEL, input.worstCaseUsd, now);
    return Number(result.lastInsertRowid);
  });
}
