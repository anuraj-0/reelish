import "server-only";
import { randomBytes } from "node:crypto";
import { worstCaseUsd } from "@/lib/budget";
import { cacheGet, cachePut } from "@/lib/db";
import { PIPELINE_VERSION, recordRun, saveRecipe, type JobRow } from "@/lib/jobs/store";
import type { StageKey } from "@/lib/jobs/types";
import type { ChatPart } from "@/lib/llm/openrouter";
import { log } from "@/lib/log";
import { formatTimestamp } from "@/lib/format";
import { fetchLinkedRecipe, renderLinkedRecipe, type LinkedOutcome } from "@/lib/sources/linked-recipe";
import { fetchYoutubeVideo, YoutubeVideo } from "@/lib/sources/youtube";
import { PipelineError } from "./errors";
import { modelAnswer, type JobContext, type ModelOutput } from "./model";
import { normalizeRecipe } from "./normalize";
import { PROMPT_VERSION, SYSTEM_PROMPT, sourceBlock } from "./prompt";

export type { JobContext } from "./model";

export const YOUTUBE_STAGES: StageKey[] = ["metadata", "linked_recipe", "video", "normalize"];

const VIDEO_META_TTL_MS = 6 * 3_600_000;
const DESCRIPTION_MAX_CHARS = 5_000;

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

export function buildParts(job: JobRow, video: YoutubeVideo, description: string | null, linkedText: string | null): ChatPart[] {
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

async function stageModel(ctx: JobContext, video: YoutubeVideo, description: string | null, linkedText: string | null): Promise<ModelOutput> {
  const parts = buildParts(ctx.job, video, description, linkedText);
  const textChars = parts.reduce((n, p) => n + (p.type === "text" ? p.text.length : 0), 0);
  return modelAnswer(ctx, {
    parts,
    systemPrompt: SYSTEM_PROMPT,
    promptVersion: PROMPT_VERSION,
    worstCaseUsd: worstCaseUsd({ videoSeconds: video.durationSec, textChars }),
    timeoutMs: llmTimeoutMs(video.durationSec),
    stage: "video",
  });
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
