import "server-only";
import { randomBytes } from "node:crypto";
import { worstCaseUsd } from "@/lib/budget";
import { reserveCredits } from "@/lib/credits";
import { cacheGet, cachePut, type Db } from "@/lib/db";
import { formatTimestamp } from "@/lib/format";
import { INSTAGRAM_PIPELINE_VERSION, recordRun, saveRecipe } from "@/lib/jobs/store";
import type { StageKey } from "@/lib/jobs/types";
import { log } from "@/lib/log";
import { fetchLinkedRecipe, isUsable, renderLinkedRecipe, type LinkedOutcome } from "@/lib/sources/linked-recipe";
import { supadata } from "@/lib/sources/instagram/supadata";
import type { InstagramProvider, Paid, ReelDetails, ResumeStore, TranscriptSegment } from "@/lib/sources/instagram/types";
import { MAX_VIDEO_SECONDS } from "@/lib/sources/youtube";
import { PipelineError } from "./errors";
import { normalizeRecipe } from "./normalize";
import { INSTAGRAM_PROMPT, INSTAGRAM_PROMPT_VERSION, sourceBlock } from "./prompt";
import { captionLooksLikeRecipe, spokenWords } from "./sufficiency";
import { modelAnswer, type JobContext } from "./model";

/**
 * Instagram Reels (decision D4): creator text first, paid steps only when needed.
 *   caption (1 credit) → linked recipe (free) → enough? → transcript (2/min) → visual (5/min, only
 *   when nobody speaks) → one text-only AI call.
 * Every paid result is cached, and async provider jobs are resumable, so retries and restarts
 * don't pay twice.
 */
export const INSTAGRAM_STAGES: StageKey[] = ["caption", "linked_recipe", "transcript", "visual", "normalize"];

const DETAILS_TTL_MS = 24 * 3_600_000;
const MEDIA_TTL_MS = 7 * 86_400_000; // transcripts and visual notes don't change
const RESUME_TTL_MS = 55 * 60_000; // Supadata keeps async results for 1 hour
/** Below this, a transcript is treated as "no usable speech" (music, a few words). */
const MIN_SPOKEN_WORDS = 15;

type Ctx = JobContext & { provider?: InstagramProvider };

/** Runs a paid provider call with a credit reservation, caching the result. */
async function paid<T>(
  ctx: Ctx,
  stage: "caption" | "transcript" | "visual",
  cacheKey: string,
  ttlMs: number,
  worstCredits: number,
  fn: () => Promise<Paid<T>>,
): Promise<T> {
  const { db, job } = ctx;
  const hit = cacheGet<{ value: T }>(db, cacheKey, ttlMs);
  if (hit) {
    recordRun(db, job.id, stage, { status: "cached", provider: "supadata", credits: 0, latencyMs: 0 });
    return hit.value;
  }
  const reservedId = reserveCredits(db, { jobId: job.id, stage, worstCredits });
  const started = Date.now();
  try {
    const out = await fn();
    // Unknown billing (no header) counts at worst case: the caps must stay safe.
    recordRun(db, job.id, stage, { status: "ok", provider: "supadata", credits: out.credits ?? worstCredits, latencyMs: out.latencyMs, detail: { worstCredits } }, reservedId);
    log("supadata_call", { jobId: job.id, stage, credits: out.credits, worstCredits, ms: out.latencyMs });
    cachePut(db, cacheKey, { value: out.value });
    return out.value;
  } catch (e) {
    const code = e instanceof PipelineError ? e.code : "upstream_failed";
    // Whether failed calls are billed isn't documented; count the worst case.
    recordRun(db, job.id, stage, { status: "error", provider: "supadata", errorCode: code, credits: worstCredits, latencyMs: Date.now() - started, detail: String((e as Error).message).slice(0, 500) }, reservedId);
    log("supadata_call_failed", { jobId: job.id, stage, code, message: (e as Error).message }, "warn");
    throw e;
  }
}

function resumeStore(db: Db, key: string): ResumeStore {
  return {
    get: () => cacheGet<{ jobId: string }>(db, key, RESUME_TTL_MS)?.jobId ?? null,
    set: (jobId) => cachePut(db, key, { jobId }),
    clear: () => db.prepare("DELETE FROM source_cache WHERE key = ?").run(key),
  };
}

/** Caption text that says something: not just hashtags, mentions and links. */
export function meaningfulCaption(caption: string): string | null {
  const cleaned = caption.replace(/[⠀​-‍﻿]/g, "").trim();
  const words = cleaned.replace(/https?:\/\/\S+|[#@][\p{L}\p{N}_.]+/gu, " ").trim();
  return words.length >= 20 ? cleaned : null;
}

export function renderTranscript(segments: TranscriptSegment[]): string {
  return segments
    .map((s) => `[${formatTimestamp(s.startSec)}] ${s.text}`)
    .join("\n")
    .slice(0, 10_000);
}

export async function runInstagramJob(ctx: Ctx): Promise<string> {
  const { db, job } = ctx;
  const provider = ctx.provider ?? supadata;
  const code = job.video_id;
  const skip = (key: StageKey) => (ctx.skipStage ? ctx.skipStage(key) : ctx.setStage(key, "done"));

  // 1. Caption and details.
  ctx.setStage("caption", "active");
  const details = await paid<ReelDetails>(ctx, "caption", `ig:details:${code}`, DETAILS_TTL_MS, provider.worstCredits.details, () => provider.getDetails(job.url, ctx.signal));
  if (!details.isVideo) throw new PipelineError("not_a_video", "Instagram post is not a video");
  if (details.durationSec !== null && details.durationSec > MAX_VIDEO_SECONDS) throw new PipelineError("too_long", `Reel is ${Math.round(details.durationSec)}s`);
  const caption = meaningfulCaption(details.caption);
  ctx.setStage("caption", "done");

  // 2. The creator's written recipe, if the caption links one.
  ctx.setStage("linked_recipe", "active");
  const started = Date.now();
  const firstLine = details.caption.split(/\n/).find((l) => l.trim()) ?? "";
  const linked: LinkedOutcome = await fetchLinkedRecipe({ videoId: code, title: firstLine, description: details.caption }, { db, transport: ctx.transport, signal: ctx.signal }).catch((e): LinkedOutcome => {
    if (ctx.signal.aborted) throw e;
    return { candidates: [], attempts: [{ url: "", result: "fetch_failed", detail: String(e) }], recipe: null };
  });
  recordRun(db, job.id, "linked_recipe", {
    status: linked.candidates.length ? "ok" : "skipped",
    provider: "creator_site",
    latencyMs: Date.now() - started,
    detail: { attempts: linked.attempts, found: linked.recipe?.url ?? null },
  });
  ctx.setStage("linked_recipe", "done");

  // 3. Is the creator's text already a recipe? Then no paid transcript or visual pass.
  const captionCheck = captionLooksLikeRecipe(caption ?? "");
  const sufficient = Boolean(linked.recipe && isUsable(linked.recipe)) || captionCheck.sufficient;
  log("ig_sufficiency", { jobId: job.id, sufficient, linked: Boolean(linked.recipe), captionSufficient: captionCheck.sufficient, amountLines: captionCheck.amountLines, instructionLines: captionCheck.instructionLines });

  let transcript: string | null = null;
  let visual: string | null = null;
  if (sufficient) {
    skip("transcript");
    skip("visual");
  } else {
    ctx.setStage("transcript", "active");
    const t = await paid(ctx, "transcript", `ig:transcript:${code}`, MEDIA_TTL_MS, provider.worstCredits.transcript(details.durationSec), () =>
      provider.getTranscript(job.url, ctx.signal, resumeStore(db, `ig:pending:transcript:${code}`)),
    );
    transcript = t.segments.length ? renderTranscript(t.segments) : null;
    ctx.setStage("transcript", "done");

    // Visual pass only when nobody (meaningfully) speaks: on-screen text may then carry the recipe.
    const speech = transcript ? spokenWords(transcript) : 0;
    if (speech < MIN_SPOKEN_WORDS) {
      ctx.setStage("visual", "active");
      try {
        visual = await paid(ctx, "visual", `ig:visual:${code}`, MEDIA_TTL_MS, provider.worstCredits.visual(details.durationSec), () =>
          provider.getVisualNotes(job.url, ctx.signal, resumeStore(db, `ig:pending:visual:${code}`)),
        );
        ctx.setStage("visual", "done");
      } catch (e) {
        // Optional extra: if the credit caps don't allow it, carry on with what we have.
        if (!(e instanceof PipelineError && e.code === "limited")) throw e;
        log("ig_visual_skipped", { jobId: job.id, reason: e.message }, "warn");
        skip("visual");
      }
    } else {
      skip("visual");
    }
  }

  // Nothing to read: say so instead of asking the model to imagine a recipe.
  if (!caption && !linked.recipe && !transcript && !visual) {
    throw new PipelineError("not_a_recipe", "no caption, linked recipe, speech or on-screen text to read");
  }

  // 4. One text-only AI call over everything gathered.
  ctx.setStage("normalize", "active");
  const linkedText = linked.recipe ? renderLinkedRecipe(linked.recipe) : null;
  const detailsText = [`Creator: ${details.creatorName ?? "unknown"}${details.creatorHandle ? ` (@${details.creatorHandle})` : ""}`, details.durationSec ? `Duration: ${formatTimestamp(Math.round(details.durationSec))}` : null]
    .filter(Boolean)
    .join("\n");
  const blocks = [sourceBlock("REEL_DETAILS", detailsText)];
  if (caption) blocks.push(sourceBlock("CAPTION", caption.slice(0, 5_000)));
  if (linkedText) blocks.push(sourceBlock("LINKED_RECIPE", linkedText));
  if (transcript) blocks.push(sourceBlock("TRANSCRIPT", transcript));
  if (visual) blocks.push(sourceBlock("VISUAL_NOTES", visual.slice(0, 8_000)));
  const parts = [
    { type: "text" as const, text: INSTAGRAM_PROMPT },
    { type: "text" as const, text: blocks.join("\n\n") },
  ];
  const textChars = parts.reduce((n, p) => n + p.text.length, 0);
  const output = await modelAnswer(ctx, {
    parts,
    systemPrompt: INSTAGRAM_PROMPT,
    promptVersion: INSTAGRAM_PROMPT_VERSION,
    worstCaseUsd: worstCaseUsd({ videoSeconds: 0, textChars }),
    timeoutMs: 60_000,
    stage: "normalize",
  });

  const t0 = Date.now();
  const recipeId = `ig-${code}-${randomBytes(3).toString("hex")}`;
  const stages = ["caption", "linked_recipe", ...(sufficient ? [] : ["transcript"]), ...(visual ? ["visual"] : []), "normalize"];
  const { recipe, warnings } = normalizeRecipe(output.llm, {
    recipeId,
    pipelineVersion: INSTAGRAM_PIPELINE_VERSION,
    createdAt: new Date().toISOString(),
    stages,
    platform: "instagram",
    video: {
      videoId: code,
      url: job.url,
      title: null,
      channelTitle: details.creatorName ?? "",
      creatorHandle: details.creatorHandle,
      durationSec: details.durationSec ? Math.ceil(details.durationSec) : MAX_VIDEO_SECONDS,
      // Instagram image URLs are signed and expire within days; we don't store them.
      thumbnailUrl: null,
    },
    description: null,
    caption,
    linked: linked.recipe && linkedText ? { url: linked.recipe.url, text: linkedText } : null,
    transcript,
    visual,
    videoWatched: false,
  });
  saveRecipe(db, recipe, job.video_key);
  const missing = recipe.ingredients.filter((i) => i.quantityStatus === "missing").length;
  recordRun(db, job.id, "normalize", {
    status: "ok",
    provider: "reelish",
    latencyMs: Date.now() - t0,
    detail: { status: recipe.extraction.status, stages, ingredients: recipe.ingredients.length, steps: recipe.steps.length, missing, warnings },
  });
  log("recipe_saved", { jobId: job.id, recipeId, status: recipe.extraction.status, stages, ingredients: recipe.ingredients.length, steps: recipe.steps.length, missing, warnings });
  ctx.setStage("normalize", "done");
  return recipeId;
}
