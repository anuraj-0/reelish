import { z } from "zod";
import { Platform } from "@/lib/recipe/schema";

/** Pipeline stages, in the order they can run. Not every job runs every stage. */
export const StageKey = z.enum(["metadata", "caption", "linked_recipe", "video", "transcript", "visual", "normalize"]);
export type StageKey = z.infer<typeof StageKey>;

export const STAGE_LABEL: Record<StageKey, string> = {
  metadata: "Reading the video details",
  caption: "Reading the creator's caption",
  linked_recipe: "Checking for the creator's written recipe",
  video: "Watching the video",
  transcript: "Listening to the video",
  visual: "Reading text shown in the video",
  normalize: "Writing up your recipe",
};

export const JobErrorCode = z.enum(["unavailable", "not_a_recipe", "upstream_failed", "invalid_output", "limited", "preview_only", "too_long", "not_a_video"]);
export type JobErrorCode = z.infer<typeof JobErrorCode>;

export const JOB_ERROR_TEXT: Record<JobErrorCode, { title: string; body: string; retry: boolean }> = {
  unavailable: {
    title: "We can't open this video",
    body: "It may be private, age-restricted, or removed. Check that it plays when you're logged out, or try another link.",
    retry: false,
  },
  not_a_recipe: {
    title: "This doesn't look like a recipe",
    body: "We couldn't find ingredients or cooking steps in this video.",
    retry: false,
  },
  upstream_failed: {
    title: "Something went wrong on our side",
    body: "A service we rely on didn't respond. Trying again usually works.",
    retry: true,
  },
  invalid_output: {
    title: "We couldn't write up this recipe",
    body: "The video was read, but the result didn't pass our checks. Trying again sometimes works.",
    retry: true,
  },
  limited: {
    title: "Reelish has reached today's processing limit",
    body: "Recipes you've already opened still work. Please try this video again tomorrow.",
    retry: false,
  },
  preview_only: {
    title: "Live processing isn't switched on yet",
    body: "This preview only works with the example videos below. Real YouTube and Instagram links are coming next.",
    retry: false,
  },
  not_a_video: {
    title: "This post isn't a video",
    body: "Reelish reads Reels and video posts. Photo and carousel posts aren't supported.",
    retry: false,
  },
  too_long: {
    title: "This video is too long",
    body: "Reelish handles videos up to 15 minutes for now.",
    retry: false,
  },
};

export const JobStatus = z.object({
  id: z.string(),
  platform: Platform,
  sourceUrl: z.url(),
  status: z.enum(["queued", "running", "succeeded", "failed"]),
  /** Only stages this job will run, with what's actually happened so far. */
  stages: z.array(z.object({ key: StageKey, state: z.enum(["done", "active", "pending", "failed"]) })),
  startedAt: z.iso.datetime(),
  recipeId: z.string().nullable(),
  error: JobErrorCode.nullable(),
});
export type JobStatus = z.infer<typeof JobStatus>;

export const CreateJobInput = z.object({ url: z.string().max(500) });

/** Why a job couldn't be started at all (shown inline on the start form). */
export const StartError = z.enum(["rate_limited", "instagram_not_yet"]);
export type StartError = z.infer<typeof StartError>;

export const START_ERROR_TEXT: Record<StartError, string> = {
  rate_limited: "You've started a lot of recipes in the last hour. Please wait a bit and try again.",
  instagram_not_yet: "Instagram links aren't switched on right now. YouTube videos and Shorts work.",
};

/** POST /api/jobs: either a job to watch, or a recipe that's already been made. */
export type CreateJobResponse = { jobId: string; recipeId?: undefined } | { recipeId: string; jobId?: undefined };
