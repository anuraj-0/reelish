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

export const JobErrorCode = z.enum(["unavailable", "not_a_recipe", "upstream_failed", "preview_only", "too_long"]);
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
  preview_only: {
    title: "Live processing isn't switched on yet",
    body: "This preview only works with the example videos below. Real YouTube and Instagram links are coming next.",
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
  status: z.enum(["running", "succeeded", "failed"]),
  /** Only stages this job will run, with what's actually happened so far. */
  stages: z.array(z.object({ key: StageKey, state: z.enum(["done", "active", "pending", "failed"]) })),
  startedAt: z.iso.datetime(),
  recipeId: z.string().nullable(),
  error: JobErrorCode.nullable(),
});
export type JobStatus = z.infer<typeof JobStatus>;

export const CreateJobInput = z.object({ url: z.string().max(500) });
