import "server-only";
import { z } from "zod";
import { env, requireEnv } from "@/lib/env";
import { isAbortError, PipelineError } from "@/lib/pipeline/errors";
import { parseIsoDuration } from "@/lib/recipe/time";

/** What we keep from the YouTube Data API (videos.list, 1 quota unit per call). */
export const YoutubeVideo = z.object({
  videoId: z.string(),
  title: z.string(),
  description: z.string(),
  channelTitle: z.string(),
  channelId: z.string(),
  durationSec: z.number().nonnegative(),
  thumbnailUrl: z.url().nullable(),
  language: z.string().nullable(),
});
export type YoutubeVideo = z.infer<typeof YoutubeVideo>;

export const MAX_VIDEO_SECONDS = 15 * 60; // decision D5

const TIMEOUT_MS = 10_000;

const ApiItem = z.object({
  id: z.string(),
  snippet: z.object({
    title: z.string(),
    description: z.string().default(""),
    channelTitle: z.string().default(""),
    channelId: z.string().default(""),
    liveBroadcastContent: z.string().optional(),
    defaultAudioLanguage: z.string().optional(),
    defaultLanguage: z.string().optional(),
    thumbnails: z.record(z.string(), z.object({ url: z.string() })).default({}),
  }),
  contentDetails: z.object({
    duration: z.string(),
    contentRating: z.object({ ytRating: z.string().optional() }).loose().optional(),
  }),
  status: z.object({ privacyStatus: z.string(), uploadStatus: z.string().optional() }).loose(),
});

/**
 * Fetch a public video's details. Throws PipelineError:
 * - unavailable: deleted, private, still processing, live/upcoming, age-restricted
 * - too_long: over 15 minutes
 * - upstream_failed: network, timeout, 5xx (retryable), quota or key problems (not retryable)
 */
export async function fetchYoutubeVideo(videoId: string, signal?: AbortSignal): Promise<YoutubeVideo> {
  const key = requireEnv("YOUTUBE_API_KEY");
  const url = `${env().YOUTUBE_API_BASE_URL}/videos?part=snippet,contentDetails,status&id=${encodeURIComponent(videoId)}`;
  let res: Response;
  try {
    // The key goes in a header, not the URL, so it can't leak through logged URLs.
    res = await fetch(url, {
      headers: { "X-goog-api-key": key, Accept: "application/json" },
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(TIMEOUT_MS)]) : AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (e) {
    throw new PipelineError("upstream_failed", isAbortError(e) ? "YouTube Data API timed out" : "YouTube Data API network error", { cause: e });
  }

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: { errors?: { reason?: string }[] } } | null;
    const reason = body?.error?.errors?.[0]?.reason ?? "unknown";
    // Quota and key problems won't fix themselves on an immediate retry.
    const retryable = res.status >= 500 || res.status === 429;
    throw new PipelineError("upstream_failed", `YouTube Data API ${res.status} (${reason})`, { retryable });
  }

  const body = (await res.json()) as { items?: unknown[] };
  const raw = body.items?.[0];
  if (!raw) throw new PipelineError("unavailable", "video not found (deleted, private or wrong id)");
  const parsed = ApiItem.safeParse(raw);
  if (!parsed.success) throw new PipelineError("upstream_failed", "unexpected YouTube Data API response", { retryable: false });
  const item = parsed.data;

  if (item.status.privacyStatus === "private") throw new PipelineError("unavailable", "video is private");
  if (item.status.uploadStatus && item.status.uploadStatus !== "processed") throw new PipelineError("unavailable", `upload status ${item.status.uploadStatus}`);
  if (item.snippet.liveBroadcastContent && item.snippet.liveBroadcastContent !== "none") throw new PipelineError("unavailable", "live or upcoming stream");
  if (item.contentDetails.contentRating?.ytRating === "ytAgeRestricted") throw new PipelineError("unavailable", "age-restricted");

  const durationSec = parseIsoDuration(item.contentDetails.duration);
  if (durationSec === null || durationSec === 0) throw new PipelineError("unavailable", `unusable duration ${item.contentDetails.duration}`);
  if (durationSec > MAX_VIDEO_SECONDS) throw new PipelineError("too_long", `video is ${durationSec}s`);

  const thumbs = item.snippet.thumbnails;
  const thumb = thumbs.high?.url ?? thumbs.medium?.url ?? thumbs.default?.url ?? null;
  return {
    videoId: item.id,
    title: item.snippet.title,
    description: item.snippet.description,
    channelTitle: item.snippet.channelTitle,
    channelId: item.snippet.channelId,
    durationSec,
    // Only i.ytimg.com images (the one host next/image allows).
    thumbnailUrl: thumb && /^https:\/\/i\.ytimg\.com\/vi\//.test(thumb) ? thumb : null,
    language: item.snippet.defaultAudioLanguage ?? item.snippet.defaultLanguage ?? null,
  };
}
