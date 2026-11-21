import "server-only";
import { z } from "zod";
import { env, requireEnv } from "@/lib/env";
import { isAbortError, PipelineError } from "@/lib/pipeline/errors";
import type { InstagramProvider, Paid, ResumeStore } from "./types";

/**
 * Supadata (https://docs.supadata.ai): the only module that knows its endpoints.
 * Costs (docs, confirmed in the spike): metadata 1 credit; transcript 1 (native) or
 * 2 per started minute (generated); extract 5 per started minute, minimum 5.
 * Free plan: 100 credits/month, 1 request/second.
 */

const VISUAL_PROMPT =
  "This is a cooking video. Report only what is actually said or shown. Return: the recipe title; " +
  "every ingredient with its quantity exactly as said or shown on screen (null if not given); " +
  "where each quantity came from (speech or on-screen text); the cooking steps in order with any " +
  "times, temperatures and heat levels; and a verbatim list of all on-screen text. Do not guess quantities.";

// Free plan: 1 request per second. Tests shorten these.
const pacing = { minIntervalMs: 1_100, pollMs: 1_500 };
export function setSupadataPacingForTests(p: Partial<typeof pacing>) {
  Object.assign(pacing, p);
}

// One queue per process: every request (including polls) waits its turn.
let nextSlot = 0;
async function rateLimit(signal: AbortSignal) {
  const now = Date.now();
  const wait = Math.max(0, nextSlot - now);
  nextSlot = Math.max(now, nextSlot) + pacing.minIntervalMs;
  if (wait) await sleep(wait, signal);
}

function sleep(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => (clearTimeout(t), reject(signal.reason)), { once: true });
  });
}

type SdError = { error?: string; message?: string; details?: string };

/** Supadata error codes → what they mean for the user. */
export function mapSupadataError(status: number, body: SdError | null, what: string): PipelineError {
  const code = body?.error ?? "unknown";
  const msg = `Supadata ${what} ${status} ${code}${body?.details ? `: ${body.details.slice(0, 200)}` : ""}`;
  if (status === 404 || code === "not-found") return new PipelineError("unavailable", msg);
  if (status === 403 || code === "forbidden") return new PipelineError("unavailable", msg); // private or restricted
  if (status === 400 || code === "invalid-request") return new PipelineError("unavailable", msg);
  if (status === 402 || code === "upgrade-required") return new PipelineError("limited", msg);
  if (status === 429 && /usage limit/i.test(body?.details ?? "")) return new PipelineError("limited", msg); // monthly credits gone
  if (status === 429 || status >= 500) return new PipelineError("upstream_failed", msg, { retryable: true });
  return new PipelineError("upstream_failed", msg, { retryable: false }); // 401 and anything unexpected
}

async function call(path: string, init: { method?: "GET" | "POST"; body?: unknown; signal: AbortSignal; what: string }) {
  await rateLimit(init.signal);
  const key = requireEnv("SUPADATA_API_KEY");
  let res: Response;
  try {
    res = await fetch(`${env().SUPADATA_BASE_URL}${path}`, {
      method: init.method ?? "GET",
      headers: { "x-api-key": key, Accept: "application/json", ...(init.body ? { "Content-Type": "application/json" } : {}) },
      body: init.body ? JSON.stringify(init.body) : undefined,
      signal: init.signal,
      cache: "no-store",
    });
  } catch (e) {
    throw new PipelineError("upstream_failed", isAbortError(e) ? `Supadata ${init.what} timed out` : `Supadata ${init.what} network error`, { retryable: true, cause: e });
  }
  const billed = Number(res.headers.get("x-billable-requests"));
  const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  return { status: res.status, body, credits: Number.isFinite(billed) && res.headers.has("x-billable-requests") ? billed : null };
}

const Metadata = z.object({
  type: z.string(),
  id: z.string().optional(),
  description: z.string().nullable().optional(),
  author: z.object({ username: z.string().nullable().optional(), displayName: z.string().nullable().optional() }).nullable().optional(),
  media: z.object({ type: z.string().optional(), duration: z.number().nullable().optional() }).loose().nullable().optional(),
  additionalData: z.object({ isVideo: z.boolean().optional() }).loose().nullable().optional(),
});

const Chunk = z.object({ text: z.string(), offset: z.number().optional() });
const TranscriptBody = z.object({ lang: z.string().nullable().optional(), content: z.union([z.array(Chunk), z.string()]).optional() });

/** Starts or resumes an async Supadata job and polls it to completion. */
async function runJob<T>(opts: {
  start: () => Promise<{ status: number; body: Record<string, unknown> | null; credits: number | null }>;
  pollPath: (jobId: string) => string;
  resume: ResumeStore;
  signal: AbortSignal;
  what: string;
  done: (body: Record<string, unknown>) => T | undefined;
}): Promise<{ value: T; credits: number | null }> {
  let credits: number | null = 0;
  let jobId = opts.resume.get();
  if (!jobId) {
    const first = await opts.start();
    credits = first.credits;
    if (first.status === 200 && first.body) {
      const value = opts.done(first.body);
      if (value !== undefined) return { value, credits };
    }
    if (first.status !== 202 || typeof first.body?.jobId !== "string") throw mapSupadataError(first.status, first.body as SdError, opts.what);
    jobId = first.body.jobId;
    opts.resume.set(jobId);
  }
  for (;;) {
    await sleep(pacing.pollMs, opts.signal);
    const poll = await call(opts.pollPath(jobId), { signal: opts.signal, what: `${opts.what} poll` });
    if (poll.status === 404) {
      // Supadata keeps results for 1 hour; an expired job must be started again.
      opts.resume.clear();
      throw new PipelineError("upstream_failed", `Supadata ${opts.what} job expired`, { retryable: true });
    }
    if (poll.status !== 200 || !poll.body) throw mapSupadataError(poll.status, poll.body as SdError, `${opts.what} poll`);
    const status = poll.body.status;
    if (status === "failed") {
      opts.resume.clear();
      throw mapSupadataError(400, (poll.body.error as SdError) ?? { error: "failed" }, opts.what);
    }
    if (status === "completed" || (status === undefined && poll.body.content !== undefined)) {
      opts.resume.clear();
      const value = opts.done(poll.body);
      if (value === undefined) throw new PipelineError("upstream_failed", `Supadata ${opts.what}: unexpected result`, { retryable: false });
      return { value, credits };
    }
  }
}

const minutes = (sec: number | null) => Math.max(1, Math.ceil((sec ?? 180) / 60)); // unknown length: assume 3 min

export const supadata: InstagramProvider = {
  name: "supadata",
  worstCredits: {
    details: 1,
    transcript: (sec) => 2 * minutes(sec),
    visual: (sec) => Math.max(5, 5 * minutes(sec)),
  },

  async getDetails(reelUrl, signal): Promise<Paid<import("./types").ReelDetails>> {
    const t = Date.now();
    const res = await call(`/metadata?url=${encodeURIComponent(reelUrl)}`, { signal, what: "metadata" });
    if (res.status !== 200 || !res.body) throw mapSupadataError(res.status, res.body as SdError, "metadata");
    const parsed = Metadata.safeParse(res.body);
    if (!parsed.success) throw new PipelineError("upstream_failed", "Supadata metadata: unexpected shape", { retryable: false });
    const m = parsed.data;
    const isVideo = m.type === "video" || m.media?.type === "video" || m.additionalData?.isVideo === true;
    return {
      value: {
        shortcode: m.id ?? "",
        caption: m.description ?? "",
        creatorName: m.author?.displayName ?? null,
        creatorHandle: m.author?.username ?? null,
        durationSec: typeof m.media?.duration === "number" ? m.media.duration : null,
        isVideo,
      },
      credits: res.credits,
      latencyMs: Date.now() - t,
    };
  },

  async getTranscript(reelUrl, signal, resume) {
    const t = Date.now();
    const parse = (body: Record<string, unknown>) => {
      const p = TranscriptBody.safeParse(body);
      if (!p.success || p.data.content === undefined) return undefined;
      const content = p.data.content;
      const segments = typeof content === "string" ? [{ startSec: 0, text: content }] : content.map((c) => ({ startSec: Math.round((c.offset ?? 0) / 1000), text: c.text.trim() })).filter((s) => s.text);
      const lang = p.data.lang && p.data.lang !== "none" ? p.data.lang : null;
      return { lang, segments };
    };
    const query = `/transcript?url=${encodeURIComponent(reelUrl)}&lang=en&mode=auto&text=false`;
    const out = await runJob({
      start: async () => {
        const r = await call(query, { signal, what: "transcript" });
        // 206 transcript-unavailable: no speech we can use (billed 1 credit).
        if (r.status === 206) return { ...r, status: 200, body: { lang: null, content: [] } };
        return r;
      },
      pollPath: (id) => `/transcript/${id}`,
      resume,
      signal,
      what: "transcript",
      done: parse,
    });
    return { ...out, latencyMs: Date.now() - t };
  },

  async getVisualNotes(reelUrl, signal, resume) {
    const t = Date.now();
    const out = await runJob({
      start: () => call("/extract", { method: "POST", body: { url: reelUrl, prompt: VISUAL_PROMPT }, signal, what: "extract" }),
      pollPath: (id) => `/extract/${id}`,
      resume,
      signal,
      what: "extract",
      done: (body) => (body.status === "completed" && body.data !== undefined ? JSON.stringify(body.data, null, 1) : undefined),
    });
    return { ...out, latencyMs: Date.now() - t };
  },
};
