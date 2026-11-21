import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { MODEL, reserveSpend, worstCaseUsd } from "@/lib/budget";
import { cacheGet, cachePut, type Db } from "@/lib/db";
import { recordRun, type JobRow, type StageState } from "@/lib/jobs/store";
import type { StageKey } from "@/lib/jobs/types";
import { chat, parseJsonContent, type ChatPart, type ChatResult } from "@/lib/llm/openrouter";
import { log } from "@/lib/log";
import type { Transport } from "@/lib/sources/safe-fetch";
import { isAbortError, PipelineError } from "./errors";
import { LlmRecipe, REPAIR_PROMPT } from "./prompt";

/** Shared by the YouTube and Instagram pipelines: the job context and the (cached) AI call. */

const AI_RESPONSE_TTL_MS = 7 * 86_400_000;

export type JobContext = {
  db: Db;
  job: JobRow;
  signal: AbortSignal;
  setStage: (key: StageKey, state: StageState) => void;
  /** Remove a stage the job decided not to run. */
  skipStage?: (key: StageKey) => void;
  /** Tests inject a fake transport for linked-recipe pages. */
  transport?: Transport;
};

export type ModelOutput = { content: string; llm: LlmRecipe };

function issuesSummary(error: z.ZodError): string {
  return error.issues
    .slice(0, 12)
    .map((i) => `- ${i.path.join(".") || "(root)"}: ${i.message}`)
    .join("\n");
}

async function callModel(ctx: JobContext, stage: "video" | "normalize" | "repair", parts: ChatPart[], worst: number, timeoutMs: number): Promise<ChatResult> {
  const reservedId = reserveSpend(ctx.db, { jobId: ctx.job.id, stage, worstCaseUsd: worst });
  const started = Date.now();
  try {
    const result = await chat(parts, { signal: ctx.signal, timeoutMs });
    const fields = {
      status: "ok" as const,
      provider: "openrouter",
      model: result.model,
      latencyMs: result.latencyMs,
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
      // If OpenRouter didn't report a cost, count the worst case so the budget stays safe.
      costUsd: result.usage.costUsd ?? worst,
      detail: { provider: result.provider, finishReason: result.finishReason, videoTokens: result.usage.videoTokens, worstCaseUsd: worst },
    };
    recordRun(ctx.db, ctx.job.id, stage, fields, reservedId);
    log("ai_call", { jobId: ctx.job.id, stage, model: result.model, provider: result.provider, ms: result.latencyMs, ...result.usage, worstCaseUsd: worst, finishReason: result.finishReason });
    if (result.usage.costUsd !== null && result.usage.costUsd > worst) log("cost_over_worst_case", { jobId: ctx.job.id, stage, costUsd: result.usage.costUsd, worst }, "warn");
    return result;
  } catch (e) {
    const code = e instanceof PipelineError ? e.code : "upstream_failed";
    // A timed-out request may still be billed; count it at worst case. Rejected requests aren't billed.
    const maybeBilled = isAbortError(e) || (e instanceof PipelineError && /timed out|network/.test(e.message));
    recordRun(
      ctx.db,
      ctx.job.id,
      stage,
      { status: "error", provider: "openrouter", model: MODEL, errorCode: code, latencyMs: Date.now() - started, costUsd: maybeBilled ? worst : 0, detail: String((e as Error).message).slice(0, 500) },
      reservedId,
    );
    log("ai_call_failed", { jobId: ctx.job.id, stage, code, message: (e as Error).message, ms: Date.now() - started }, "warn");
    throw e;
  }
}

/**
 * One AI answer for these exact inputs: from cache if we've paid for it before, otherwise a call
 * (budget-reserved), plus one text-only repair if the shape is wrong. Valid answers are cached.
 */
export async function modelAnswer(
  ctx: JobContext,
  input: { parts: ChatPart[]; systemPrompt: string; promptVersion: string; worstCaseUsd: number; timeoutMs: number; stage: "video" | "normalize" },
): Promise<ModelOutput> {
  const cacheKey = `ai:${createHash("sha256").update([input.promptVersion, MODEL, ctx.job.url, JSON.stringify(input.parts)].join("\n")).digest("hex")}`;
  const hit = cacheGet<{ content: string }>(ctx.db, cacheKey, AI_RESPONSE_TTL_MS);
  if (hit) {
    const parsed = LlmRecipe.safeParse(safeJson(hit.content));
    if (parsed.success) {
      recordRun(ctx.db, ctx.job.id, input.stage, { status: "cached", provider: "openrouter", model: MODEL, latencyMs: 0, costUsd: 0 });
      return { content: hit.content, llm: parsed.data };
    }
  }

  const first = await callModel(ctx, input.stage, input.parts, input.worstCaseUsd, input.timeoutMs);
  let content = first.content;
  let parsed = LlmRecipe.safeParse(safeJson(content));
  if (!parsed.success) {
    // One repair attempt, text only: we send back the answer and the problems, not the video.
    const problems = safeJson(content) === undefined ? "- the answer was not valid JSON" : issuesSummary(parsed.error);
    log("ai_output_invalid", { jobId: ctx.job.id, problems, finishReason: first.finishReason }, "warn");
    const repairParts: ChatPart[] = [
      { type: "text", text: input.systemPrompt },
      { type: "text", text: `${REPAIR_PROMPT}\n${problems}\n\nPrevious answer:\n${content.slice(0, 30_000)}` },
    ];
    const repairChars = repairParts.reduce((n, p) => n + (p.type === "text" ? p.text.length : 0), 0);
    const repaired = await callModel(ctx, "repair", repairParts, worstCaseUsd({ videoSeconds: 0, textChars: repairChars }), 60_000);
    content = repaired.content;
    parsed = LlmRecipe.safeParse(safeJson(content));
    if (!parsed.success) throw new PipelineError("invalid_output", `model output invalid after repair: ${issuesSummary(parsed.error)}`);
  }
  cachePut(ctx.db, cacheKey, { content });
  return { content, llm: parsed.data };
}

function safeJson(content: string): unknown {
  try {
    return parseJsonContent(content);
  } catch {
    return undefined;
  }
}

