import { clientHash, startJob } from "@/lib/jobs/service";

/**
 * The start form's no-JavaScript path: a plain form POST (e.g. tapped before the page hydrated).
 * Same rules as POST /api/jobs (validation, cache, dedup, rate limit), then a 303 redirect.
 * Errors go back to the home page, where the JavaScript form explains them.
 */
export async function POST(request: Request) {
  const form = await request.formData().catch(() => null);
  const url = form?.get("url");
  // A relative Location: behind Nginx, request.url carries the app's own address (localhost:PORT),
  // not the public one, so an absolute redirect would send visitors to localhost.
  const back = (path: string) => new Response(null, { status: 303, headers: { Location: path } });
  if (typeof url !== "string" || url.length > 500) return back("/");
  const result = startJob(url, clientHash(request.headers));
  if (result.body.recipeId) return back(`/r/${result.body.recipeId}`);
  if (result.body.jobId) return back(`/jobs/${result.body.jobId}`);
  return back("/");
}
