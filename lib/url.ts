import type { Platform } from "./recipe/schema";

export type ParsedVideoUrl = {
  platform: Platform;
  videoId: string;
  /** Rebuilt by us. The user's raw string is never passed to a fetcher. */
  canonicalUrl: string;
  /** Stable cache / job key. */
  key: string;
};

export type UrlError = "empty" | "invalid" | "unsupported_site" | "unsupported_path";

export type ParseResult = { ok: true; value: ParsedVideoUrl } | { ok: false; error: UrlError };

const YOUTUBE_HOSTS = new Set(["youtube.com", "www.youtube.com", "m.youtube.com"]);
const YOUTUBE_SHORT_HOSTS = new Set(["youtu.be"]);
const INSTAGRAM_HOSTS = new Set(["instagram.com", "www.instagram.com"]);
const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
const INSTAGRAM_CODE = /^[A-Za-z0-9_-]{5,40}$/;
const MAX_LENGTH = 500;

export const URL_ERROR_TEXT: Record<UrlError, string> = {
  empty: "Paste a link to a YouTube or Instagram cooking video.",
  invalid: "That doesn't look like a YouTube or Instagram link. Check the URL and try again.",
  unsupported_site: "Reelish works with YouTube and Instagram links. Check the URL and try again.",
  unsupported_path: "That link isn't a single video. Open the video itself, then copy its link.",
};

function youtube(id: string | null | undefined): ParseResult {
  if (!id || !YOUTUBE_ID.test(id)) return { ok: false, error: "unsupported_path" };
  return {
    ok: true,
    value: { platform: "youtube", videoId: id, canonicalUrl: `https://www.youtube.com/watch?v=${id}`, key: `youtube:${id}` },
  };
}

function instagram(code: string | null | undefined): ParseResult {
  if (!code || !INSTAGRAM_CODE.test(code)) return { ok: false, error: "unsupported_path" };
  return {
    ok: true,
    value: { platform: "instagram", videoId: code, canonicalUrl: `https://www.instagram.com/reel/${code}/`, key: `instagram:${code}` },
  };
}

export function parseVideoUrl(input: string): ParseResult {
  const trimmed = input.trim();
  if (!trimmed) return { ok: false, error: "empty" };
  if (trimmed.length > MAX_LENGTH) return { ok: false, error: "invalid" };

  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
  } catch {
    return { ok: false, error: "invalid" };
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return { ok: false, error: "invalid" };
  if (url.username || url.password || url.port) return { ok: false, error: "invalid" };

  const host = url.hostname.toLowerCase();
  const parts = url.pathname.split("/").filter(Boolean);

  if (YOUTUBE_SHORT_HOSTS.has(host)) return youtube(parts[0]);
  if (YOUTUBE_HOSTS.has(host)) {
    if (parts[0] === "watch") return youtube(url.searchParams.get("v"));
    if (["shorts", "embed", "live"].includes(parts[0] ?? "")) return youtube(parts[1]);
    return { ok: false, error: "unsupported_path" };
  }
  if (INSTAGRAM_HOSTS.has(host)) {
    // /reel/X, /reels/X, /p/X, and profile-scoped /<user>/reel/X
    const i = parts.findIndex((p) => p === "reel" || p === "reels" || p === "p");
    if (i === -1 || i > 1) return { ok: false, error: "unsupported_path" };
    return instagram(parts[i + 1]);
  }
  return { ok: false, error: "unsupported_site" };
}
