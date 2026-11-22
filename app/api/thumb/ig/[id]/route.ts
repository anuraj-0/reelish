import { reelHasRecipe } from "@/lib/jobs/lookup";

/**
 * A reel's still, fetched by the server. Instagram's picture links expire within days, and its image
 * server sends `Cross-Origin-Resource-Policy: same-origin`, so browsers won't show them on our pages.
 * We ask Instagram's undocumented /media/ address for a fresh link each time, pass the image through,
 * and keep nothing. Only reels we have a recipe for, so this can't fetch arbitrary Instagram images.
 * Any failure is a 404, and the page shows its plain placeholder instead.
 */

const MAX_BYTES = 1_000_000;
const TIMEOUT_MS = 5_000;
const IMAGE_HOST = /(^|\.)(cdninstagram\.com|fbcdn\.net)$/;
const HEADERS = { "User-Agent": "Mozilla/5.0 (compatible; ReelishBot/0.1; +https://deepclean.app/reelish)" };

export async function GET(_request: Request, ctx: RouteContext<"/api/thumb/ig/[id]">) {
  const { id } = await ctx.params;
  if (!/^[A-Za-z0-9_-]{5,40}$/.test(id) || !reelHasRecipe(id)) return notFound();
  try {
    const signal = AbortSignal.timeout(TIMEOUT_MS);
    const hop = await fetch(`https://www.instagram.com/p/${id}/media/?size=l`, { redirect: "manual", headers: HEADERS, signal });
    const location = hop.headers.get("location");
    const target = location ? new URL(location) : null;
    if (hop.status < 300 || hop.status >= 400 || target?.protocol !== "https:" || !IMAGE_HOST.test(target.hostname)) return notFound();

    const res = await fetch(target, { redirect: "error", headers: HEADERS, signal });
    const type = res.headers.get("content-type") ?? "";
    if (!res.ok || !/^image\/(jpeg|png|webp)$/.test(type) || Number(res.headers.get("content-length") ?? 0) > MAX_BYTES) return notFound();
    const body = await res.arrayBuffer();
    if (body.byteLength > MAX_BYTES) return notFound();

    // Browsers keep it a day, so a returning visitor doesn't make us ask Instagram again.
    return new Response(body, { headers: { "Content-Type": type, "Cache-Control": "public, max-age=86400", "X-Content-Type-Options": "nosniff" } });
  } catch {
    return notFound();
  }
}

function notFound() {
  // Cached briefly so a reel Instagram won't serve isn't retried on every page view.
  return new Response(null, { status: 404, headers: { "Cache-Control": "public, max-age=3600" } });
}
