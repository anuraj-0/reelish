import { basePath } from "./base-path";
import type { Platform, Recipe, TimeValue } from "./recipe/schema";

export function formatTimestamp(totalSec: number): string {
  const s = Math.floor(totalSec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function formatMinutes(t: TimeValue | null): string | null {
  if (!t) return null;
  if (t.minutes === null) return t.raw;
  const h = Math.floor(t.minutes / 60);
  const m = t.minutes % 60;
  return h ? (m ? `${h} hr ${m} min` : `${h} hr`) : `${m} min`;
}

export const PLATFORM_NAME: Record<Platform, string> = { youtube: "YouTube", instagram: "Instagram" };

/** Link to the original video, at a moment when the platform supports it (YouTube only). */
export function videoLink(recipe: Pick<Recipe, "source">, atSec?: number | null): string {
  const { platform, url } = recipe.source;
  if (platform === "youtube" && atSec != null) return `${url}&t=${Math.floor(atSec)}s`;
  return url;
}

/**
 * The video's still. A reel's comes through our own route (app/api/thumb/ig), because Instagram's
 * picture links expire and browsers won't load them on other sites. That route can fail at any time;
 * callers fall back to no picture when the image doesn't load.
 */
export function thumbnailFor(source: Pick<Recipe["source"], "platform" | "videoId" | "thumbnailUrl">): string | null {
  if (source.platform === "instagram") return `${basePath}/api/thumb/ig/${encodeURIComponent(source.videoId)}`;
  return source.thumbnailUrl;
}

export function canSeek(platform: Platform): boolean {
  return platform === "youtube";
}

export function hostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
