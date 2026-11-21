import "server-only";
import { createHash } from "node:crypto";
import { getDb, getSecretSalt, transaction, type Db } from "@/lib/db";
import { env, instagramLive, pipelineMode } from "@/lib/env";
import { findFixtureByKey, getFixtureRecipe } from "@/lib/fixtures";
import { log } from "@/lib/log";
import { INSTAGRAM_STAGES } from "@/lib/pipeline/instagram";
import { YOUTUBE_STAGES } from "@/lib/pipeline/youtube";
import type { Recipe } from "@/lib/recipe/schema";
import { parseVideoUrl, type UrlError } from "@/lib/url";
import { createMockJob, getMockJob } from "./mock";
import { countRecentJobsByClient, findActiveJob, findRecipeIdForVideo, findReusableFailure, getJob, getStoredRecipe, insertJob, toJobStatus } from "./store";
import type { CreateJobResponse, JobStatus, StartError } from "./types";

/** 202 = job to watch, 200 = recipe already made, 400/429 = couldn't start. */
export type StartResult = { status: 200 | 202 | 400 | 429; body: Partial<CreateJobResponse> & { error?: UrlError | StartError } };

const HOUR_MS = 3_600_000;

/** A visitor's rate-limit bucket: a salted hash of their address, never the address itself. */
export function clientHash(headers: Headers, db: Db = getDb()): string {
  const forwarded = env().TRUST_PROXY ? (headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? headers.get("x-real-ip")) : null;
  // Without a trusted proxy we can't see real addresses, so everyone shares one bucket.
  const ip = forwarded || "direct";
  return createHash("sha256").update(`${getSecretSalt(db)}:${ip}`).digest("hex").slice(0, 24);
}

export function startJob(rawUrl: string, client: string, db: Db = getDb()): StartResult {
  const parsed = parseVideoUrl(rawUrl);
  if (!parsed.ok) return { status: 400, body: { error: parsed.error } };
  const video = parsed.value;

  // Offline mode: simulated jobs over the saved fixtures.
  if (pipelineMode() === "fixtures") return { status: 202, body: { jobId: createMockJob(video) } };
  // Instagram switched off (flag or missing key): only the saved examples work.
  if (video.platform === "instagram" && !instagramLive()) {
    if (findFixtureByKey(video.key)) return { status: 202, body: { jobId: createMockJob(video) } };
    return { status: 400, body: { error: "instagram_not_yet" } };
  }

  return transaction(db, (): StartResult => {
    // 1. Already made: no job, no cost.
    const recipeId = findRecipeIdForVideo(db, video.key);
    if (recipeId) {
      log("job_cache_hit", { key: video.key, recipeId });
      return { status: 200, body: { recipeId } };
    }
    // 2. Someone (maybe this visitor, double-clicking) is already processing it: join that job.
    const active = findActiveJob(db, video.key);
    if (active) return { status: 202, body: { jobId: active.id } };
    // 3. We recently learned it's not a recipe / too long / unavailable: show that again.
    const failure = findReusableFailure(db, video.key);
    if (failure) return { status: 202, body: { jobId: failure.id } };
    // 4. New work counts against the visitor's hourly limit.
    if (countRecentJobsByClient(db, client, HOUR_MS) >= env().RATE_LIMIT_PER_HOUR) {
      log("rate_limited", { client });
      return { status: 429, body: { error: "rate_limited" } };
    }
    const jobId = insertJob(db, { parsed: video, stages: video.platform === "instagram" ? INSTAGRAM_STAGES : YOUTUBE_STAGES, clientHash: client });
    log("job_created", { jobId, key: video.key });
    return { status: 202, body: { jobId } };
  });
}

export function getJobStatus(id: string, db: Db = getDb()): JobStatus | null {
  const mock = getMockJob(id);
  if (mock) return mock;
  if (pipelineMode() === "fixtures") return null;
  const row = getJob(db, id);
  return row ? toJobStatus(row) : null;
}

/** Saved test recipes first (stable ids), then recipes made by the live pipeline. */
export function getRecipe(id: string, db?: Db): Recipe | null {
  const fixture = getFixtureRecipe(id);
  if (fixture) return fixture;
  if (pipelineMode() === "fixtures" || (!id.startsWith("yt-") && !id.startsWith("ig-"))) return null;
  return getStoredRecipe(db ?? getDb(), id);
}
