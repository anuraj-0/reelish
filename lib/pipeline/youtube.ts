import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { MODEL, reserveSpend, worstCaseUsd } from "@/lib/budget";
import { cacheGet, cachePut, type Db } from "@/lib/db";
import { PIPELINE_VERSION, recordRun, saveRecipe, type JobRow, type StageState } from "@/lib/jobs/store";
import type { StageKey } from "@/lib/jobs/types";
import { chat, parseJsonContent, type ChatPart, type ChatResult } from "@/lib/llm/openrouter";
import { log } from "@/lib/log";
import { formatTimestamp } from "@/lib/format";
import { fetchLinkedRecipe, renderLinkedRecipe, type LinkedOutcome } from "@/lib/sources/linked-recipe";
import type { Transport } from "@/lib/sources/safe-fetch";
import { fetchYoutubeVideo, YoutubeVideo } from "@/lib/sources/youtube";
import { isAbortError, PipelineError } from "./errors";
import { normalizeRecipe } from "./normalize";
import { LlmRecipe, PROMPT_VERSION, REPAIR_PROMPT, SYSTEM_PROMPT, sourceBlock } from "./prompt";

export const YOUTUBE_STAGES: StageKey[] = ["metadata", "linked_recipe", "video", "normalize"];

const VIDEO_META_TTL_MS = 6 * 3_600_000;
const AI_RESPONSE_TTL_MS = 7 * 86_400_000;
const DESCRIPTION_MAX_CHARS = 5_000;

export type JobContext = {
  db: Db;
  job: JobRow;
  signal: AbortSignal;
  setStage: (key: StageKey, state: StageState) => void;
  /** Tests inject a fake transport for linked-recipe pages. */
  transport?: Transport;
};

/** Longer videos take Gemini longer to read. Stays inside the job's overall cap. */
export const llmTimeoutMs = (durationSec: number) => Math.min(120_000, 45_000 + durationSec * 100);

async function timed<T>(fn: () => Promise<T>): Promise<{ value: T; ms: number }> {
  const t = Date.now();
  const value = await fn();
  return { value, ms: Date.now() - t };
}

async function stageMetadata(ctx: JobContext): Promise<YoutubeVideo> {
  const { db, job } = ctx;
  const key = `yt:video:${job.video_id}`;
  const hit = cacheGet<unknown>(db, key, VIDEO_META_TTL_MS);
  const cached = hit ? YoutubeVideo.safeParse(hit) : null;
  if (cached?.success) {
    recordRun(db, job.id, "metadata", { status: "cached", provider: "youtube_data_api", latencyMs: 0 });
    return cached.data;
  }
  const started = Date.now();
  try {
    const video = await fetchYoutubeVideo(job.video_id, ctx.signal);
    cachePut(db, key, video);
    recordRun(db, job.id, "metadata", { status: "ok", provider: "youtube_data_api", latencyMs: Date.now() - started, detail: { durationSec: video.durationSec } });
    log("stage", { jobId: job.id, stage: "metadata", status: "ok", ms: Date.now() - started, durationSec: video.durationSec });
    return video;
  } catch (e) {
    const code = e instanceof PipelineError ? e.code : "upstream_failed";
    recordRun(db, job.id, "metadata", { status: "error", provider: "youtube_data_api", errorCode: code, latencyMs: Date.now() - started, detail: String((e as Error).message) });
    throw e;
  }
}

async function stageLinkedRecipe(ctx: JobContext, video: YoutubeVideo): Promise<LinkedOutcome> {
  const { value, ms } = await timed(() =>
    fetchLinkedRecipe(video, { db: ctx.db, transport: ctx.transport, signal: ctx.signal }).catch((e): LinkedOutcome => {
      if (ctx.signal.aborted) throw e;
      return { candidates: [], attempts: [{ url: "", result: "fetch_failed", detail: String(e) }], recipe: null };
    }),
  );
  const status = value.candidates.length === 0 ? "skipped" : "ok";
  recordRun(ctx.db, ctx.job.id, "linked_recipe", { status, provider: "creator_site", latencyMs: ms, detail: { attempts: value.attempts, found: value.recipe?.url ?? null } });
  log("stage", { jobId: ctx.job.id, stage: "linked_recipe", status, ms, candidates: value.candidates.length, attempts: value.attempts, found: value.recipe?.url ?? null });
  return value;
}

type ModelOutput = { content: string; llm: LlmRecipe };

function buildParts(job: JobRow, video: YoutubeVideo, description: string | null, linkedText: string | null): ChatPart[] {
  const details = [`Title: ${video.title}`, `Channel: ${video.channelTitle}`, `Duration: ${formatTimestamp(video.durationSec)}`].join("\n");
  const blocks = [sourceBlock("VIDEO_DETAILS", details)];
  if (description) blocks.push(sourceBlock("DESCRIPTION", description));
  if (linkedText) blocks.push(sourceBlock("LINKED_RECIPE", linkedText));
  return [
    { type: "text", text: SYSTEM_PROMPT },
    // The canonical URL we rebuilt from the video id; the user's raw input never gets here.
    { type: "video_url", video_url: { url: job.url, processing: "static" } },
    { type: "text", text: blocks.join("\n\n") },
  ];
}

function issuesSummary(error: z.ZodError): string {
  return error.issues
    .slice(0, 12)
    .map((i) => `- ${i.path.join(".") || "(root)"}: ${i.message}`)
    .join("\n");
}

async function callModel(ctx: JobContext, stage: "video" | "repair", parts: ChatPart[], worst: number, timeoutMs: number): Promise<ChatResult> {
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

async function stageModel(ctx: JobContext, video: YoutubeVideo, description: string | null, linkedText: string | null): Promise<ModelOutput> {
  const parts = buildParts(ctx.job, video, description, linkedText);
  const textChars = parts.reduce((n, p) => n + (p.type === "text" ? p.text.length : 0), 0);
  const cacheKey = `ai:${createHash("sha256").update([PROMPT_VERSION, MODEL, ctx.job.url, JSON.stringify(parts)].join("\n")).digest("hex")}`;

  // Same video, same inputs, same prompt: reuse the earlier answer instead of paying again.
  const hit = cacheGet<{ content: string }>(ctx.db, cacheKey, AI_RESPONSE_TTL_MS);
  if (hit) {
    const parsed = LlmRecipe.safeParse(safeJson(hit.content));
    if (parsed.success) {
      recordRun(ctx.db, ctx.job.id, "video", { status: "cached", provider: "openrouter", model: MODEL, latencyMs: 0, costUsd: 0 });
      return { content: hit.content, llm: parsed.data };
    }
  }

  const first = await callModel(ctx, "video", parts, worstCaseUsd({ videoSeconds: video.durationSec, textChars }), llmTimeoutMs(video.durationSec));

  let content = first.content;
  let parsed = LlmRecipe.safeParse(safeJson(content));
  if (!parsed.success) {
    // One repair attempt, text only: we send back the answer and the problems, not the video.
    const problems = safeJson(content) === undefined ? "- the answer was not valid JSON" : issuesSummary(parsed.error);
    log("ai_output_invalid", { jobId: ctx.job.id, problems, finishReason: first.finishReason }, "warn");
    const repairParts: ChatPart[] = [
      { type: "text", text: SYSTEM_PROMPT },
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

/** Runs every stage for one YouTube job. Returns the saved recipe's id; throws PipelineError. */
export async function runYoutubeJob(ctx: JobContext): Promise<string> {
  const { db, job } = ctx;

  ctx.setStage("metadata", "active");
  const video = await stageMetadata(ctx);
  ctx.setStage("metadata", "done");

  ctx.setStage("linked_recipe", "active");
  const linked = await stageLinkedRecipe(ctx, video);
  ctx.setStage("linked_recipe", "done");

  const description = video.description.trim() ? video.description.slice(0, DESCRIPTION_MAX_CHARS) : null;
  const linkedText = linked.recipe ? renderLinkedRecipe(linked.recipe) : null;

  ctx.setStage("video", "active");
  const output = await stageModel(ctx, video, description, linkedText);
  ctx.setStage("video", "done");

  ctx.setStage("normalize", "active");
  const started = Date.now();
  const recipeId = `yt-${job.video_id}-${randomBytes(3).toString("hex")}`;
  const stages = ["metadata", "linked_recipe", "video", "normalize"];
  const { recipe, warnings } = normalizeRecipe(output.llm, {
    recipeId,
    pipelineVersion: PIPELINE_VERSION,
    createdAt: new Date().toISOString(),
    stages,
    video: { videoId: video.videoId, url: job.url, title: video.title, channelTitle: video.channelTitle, durationSec: video.durationSec, thumbnailUrl: video.thumbnailUrl },
    description,
    linked: linked.recipe && linkedText ? { url: linked.recipe.url, text: linkedText } : null,
  });
  saveRecipe(db, recipe, job.video_key);
  const missing = recipe.ingredients.filter((i) => i.quantityStatus === "missing").length;
  recordRun(db, job.id, "normalize", {
    status: "ok",
    provider: "reelish",
    latencyMs: Date.now() - started,
    detail: { status: recipe.extraction.status, ingredients: recipe.ingredients.length, steps: recipe.steps.length, missing, warnings },
  });
  log("recipe_saved", { jobId: job.id, recipeId, status: recipe.extraction.status, ingredients: recipe.ingredients.length, steps: recipe.steps.length, missing, warnings });
  ctx.setStage("normalize", "done");
  return recipeId;
}
