import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { openDb, setDbForTests, type Db } from "@/lib/db";
import { resetEnvForTests } from "@/lib/env";
import { getJobStatus, getRecipe, startJob } from "@/lib/jobs/service";
import { claimNextJob, getJob, recoverStaleJobs } from "@/lib/jobs/store";
import { processJob } from "@/lib/jobs/worker";
import { runInstagramJob } from "@/lib/pipeline/instagram";
import { quantityLabel } from "@/lib/recipe/labels";
import { Recipe } from "@/lib/recipe/schema";
import { setSupadataPacingForTests } from "@/lib/sources/instagram/supadata";
import type { Transport } from "@/lib/sources/safe-fetch";
import { meta, pastaAnswer, silentAnswer, silentVisualNotes, soupReelAnswer, turkeyAnswer, turkeyTranscript } from "./fixtures/instagram";
import { recipePage } from "./fixtures/youtube";

const SD_KEY = "sd_testkey_0123456789abcdef0123456789";
const SD = "https://api.supadata.ai/v1";
const PASTA = "https://www.instagram.com/reel/DWZqrugEacU/?igsh=abc";
const SOUP = "https://www.instagram.com/reel/DQZd7W8EbPx/";
const TURKEY = "https://www.instagram.com/themodernnonna/reel/DPeUV0GjQnF/";
const SILENT = "https://www.instagram.com/reel/SILENTreel1/";

type Handler = (url: URL, init?: RequestInit) => Response | Promise<Response>;
const billed = (body: unknown, credits: number, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "x-billable-requests": String(credits) } });
const aiResponse = (content: unknown, cost = 0.003) =>
  Response.json({ provider: "Google AI Studio", model: "google/gemini-3.5-flash-lite", choices: [{ finish_reason: "stop", message: { content: JSON.stringify(content) } }], usage: { prompt_tokens: 2500, completion_tokens: 900, cost } });

function mockApis() {
  const calls: { method: string; url: URL; body?: Record<string, unknown>; headers?: Record<string, string> }[] = [];
  const routes: Record<string, Handler[]> = {};
  const defaults: Record<string, Handler> = {};
  /** Queue one response for a route ("metadata", "transcript", "transcript-poll", "extract", "extract-poll", "ai"). */
  const on = (route: string, h: Handler) => (routes[route] ??= []).push(h);
  const always = (route: string, h: Handler) => (defaults[route] = h);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(String(input));
      calls.push({ method: init?.method ?? "GET", url, body: init?.body ? JSON.parse(String(init.body)) : undefined, headers: init?.headers as Record<string, string> });
      let route: string;
      if (url.href.startsWith("https://openrouter.ai/")) route = "ai";
      else if (url.href.startsWith(`${SD}/metadata`)) route = "metadata";
      else if (url.href.startsWith(`${SD}/transcript/`)) route = "transcript-poll";
      else if (url.href.startsWith(`${SD}/transcript`)) route = "transcript";
      else if (url.href.startsWith(`${SD}/extract/`)) route = "extract-poll";
      else if (url.href.startsWith(`${SD}/extract`)) route = "extract";
      else throw new Error(`unexpected fetch ${url}`);
      const h = routes[route]?.shift() ?? defaults[route];
      if (!h) throw new Error(`no mock for ${route}`);
      return h(url, init);
    }),
  );
  const count = (route: string) =>
    calls.filter((c) => {
      const h = c.url.href;
      if (route === "ai") return h.startsWith("https://openrouter.ai/");
      if (route === "transcript") return h.startsWith(`${SD}/transcript?`);
      if (route === "extract") return h === `${SD}/extract`;
      return h.startsWith(`${SD}/${route}`);
    }).length;
  return { calls, on, always, count };
}

const transport: Transport = async (url) => {
  if (url.pathname === "/robots.txt") return { status: 404, headers: {}, body: "", truncated: false };
  if (url.href === "https://themodernnonna.com/creamy-vegetable-soup/") {
    return { status: 200, headers: { "content-type": "text/html" }, body: recipePage({ name: "Creamy Vegetable Soup", embedVideoId: "VTR8vxBFGDY" }), truncated: false };
  }
  return { status: 404, headers: {}, body: "", truncated: false };
};

async function runNext(db: Db, now = Date.now()) {
  const job = claimNextJob(db, now);
  if (!job) throw new Error("no job to run");
  await processJob(db, job, { transport });
  return getJob(db, job.id)!;
}

const runs = (db: Db) =>
  db.prepare("SELECT stage, provider, status, credits, cost_usd FROM processing_runs ORDER BY id").all() as { stage: string; provider: string; status: string; credits: number | null; cost_usd: number | null }[];
const creditsUsed = (db: Db) => runs(db).reduce((n, r) => n + (r.provider === "supadata" ? (r.credits ?? 0) : 0), 0);

let db: Db;
let api: ReturnType<typeof mockApis>;

beforeEach(() => {
  db = openDb(":memory:");
  setDbForTests(db);
  for (const [k, v] of Object.entries({ YOUTUBE_API_KEY: "yt-test-key-123456", OPENROUTER_API_KEY: "sk-or-v1-test000000000000", SUPADATA_API_KEY: SD_KEY, REELISH_PIPELINE: "live", REELISH_LOG: "silent" })) vi.stubEnv(k, v);
  resetEnvForTests();
  setSupadataPacingForTests({ minIntervalMs: 0, pollMs: 5 });
  api = mockApis();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  resetEnvForTests();
  setDbForTests(undefined);
  db.close();
});

describe("Instagram: the cheapest path that gives a recipe", () => {
  it("caption has the full recipe: 1 credit, no transcript or visual pass", async () => {
    api.always("metadata", () => billed(meta.pasta, 1));
    api.always("ai", () => aiResponse(pastaAnswer));
    const { body, status } = startJob(PASTA, "client", db);
    expect(status).toBe(202);
    expect(getJobStatus(body.jobId!, db)?.stages.map((s) => s.key)).toEqual(["caption", "linked_recipe", "transcript", "visual", "normalize"]);

    expect((await runNext(db)).status).toBe("succeeded");
    const status2 = getJobStatus(body.jobId!, db)!;
    // Stages it decided not to run are gone, not left "pending".
    expect(status2.stages).toEqual([
      { key: "caption", state: "done" },
      { key: "linked_recipe", state: "done" },
      { key: "normalize", state: "done" },
    ]);
    expect(api.count("transcript")).toBe(0);
    expect(api.count("extract")).toBe(0);
    expect(creditsUsed(db)).toBe(1);

    const recipe = getRecipe(status2.recipeId!, db)!;
    expect(Recipe.safeParse(recipe).success).toBe(true);
    expect(recipe.source).toMatchObject({ platform: "instagram", videoId: "DWZqrugEacU", url: "https://www.instagram.com/reel/DWZqrugEacU/", creator: { name: "Snejana Andreeva", handle: "themodernnonna" }, thumbnailUrl: null });
    expect(recipe.extraction).toMatchObject({ status: "complete", pipelineVersion: "ig-1", stages: ["caption", "linked_recipe", "normalize"] });
    for (const i of recipe.ingredients) expect(quantityLabel(i)).toBe("confirmed");
    expect(recipe.ingredients[0].evidence[0]).toMatchObject({ source: "caption", excerpt: "150g pasta shells" });
    expect(recipe.steps[1].temperature).toMatchObject({ value: 390, unit: "F" });

    // Text-only AI call: no video part, the caption as a labelled block.
    const ai = api.calls.find((c) => c.url.href.startsWith("https://openrouter.ai/"))!;
    const parts = (ai.body!.messages as { content: { type: string; text?: string }[] }[])[0].content;
    expect(parts.some((p) => p.type === "video_url")).toBe(false);
    expect(parts.map((p) => p.text).join()).toContain("<<<SOURCE CAPTION>>>");
    expect(parts[0].text).toContain("You do NOT get the video");

    // Credits and dollars are tracked apart.
    expect(runs(db).filter((r) => r.provider === "openrouter")).toEqual([expect.objectContaining({ stage: "normalize", status: "ok", cost_usd: 0.003, credits: null })]);
    // The key travels in a header only.
    expect(api.calls.every((c) => !c.url.href.includes(SD_KEY))).toBe(true);
    expect(api.calls.find((c) => c.url.href.startsWith(SD))!.headers!["x-api-key"]).toBe(SD_KEY);
  });

  it("caption links the creator's recipe: uses it, still no transcript", async () => {
    api.always("metadata", () => billed(meta.soup, 1));
    api.always("ai", () => aiResponse(soupReelAnswer));
    const { body } = startJob(SOUP, "client", db);
    expect((await runNext(db)).status).toBe("succeeded");
    const recipe = getRecipe(getJobStatus(body.jobId!, db)!.recipeId!, db)!;
    expect(recipe.source.linkedRecipeUrls).toEqual(["https://themodernnonna.com/creamy-vegetable-soup/"]);
    expect(recipe.ingredients.every((i) => quantityLabel(i) === "confirmed")).toBe(true);
    expect(api.count("transcript")).toBe(0);
    expect(creditsUsed(db)).toBe(1);
  });

  it("no caption: reads the transcript; skips the visual pass because the creator speaks", async () => {
    api.always("metadata", () => billed(meta.turkey, 1));
    api.always("transcript", () => billed(turkeyTranscript, 2));
    api.always("ai", () => aiResponse(turkeyAnswer));
    const { body } = startJob(TURKEY, "client", db);
    expect((await runNext(db)).status).toBe("succeeded");
    const status = getJobStatus(body.jobId!, db)!;
    expect(status.stages.map((s) => s.key)).toEqual(["caption", "linked_recipe", "transcript", "normalize"]);
    expect(api.count("extract")).toBe(0);
    expect(creditsUsed(db)).toBe(3);

    const recipe = getRecipe(status.recipeId!, db)!;
    expect(recipe.extraction.status).toBe("partial");
    expect(recipe.ingredients.find((i) => i.name === "Turkey")?.quantityStatus).toBe("missing");
    // Spoken amounts are checked against the transcript: "an orange", "a little bit … of beer".
    expect(quantityLabel(recipe.ingredients.find((i) => i.name === "Orange")!)).toBe("confirmed");
    expect(quantityLabel(recipe.ingredients.find((i) => i.name === "Beer")!)).toBe("confirmed");
    expect(recipe.steps[1].videoTimestampSec).toBe(9);
    const ai = api.calls.find((c) => c.url.href.startsWith("https://openrouter.ai/"))!;
    expect(JSON.stringify(ai.body)).toContain("[0:09] sure the turkey has thawed");
  });

  it("silent Reel without a recipe caption: transcript is empty, so the visual pass runs (async jobs)", async () => {
    api.always("metadata", () => billed({ ...meta.pasta, id: "SILENTreel1", description: "So good 😍 #matcha #latte", media: { type: "video", duration: 20 } }, 1));
    api.on("transcript", () => billed({ jobId: "t-1" }, 2, 202));
    api.on("transcript-poll", () => billed({ status: "active" }, 0));
    api.on("transcript-poll", () => billed({ status: "completed", lang: "none", content: [] }, 0));
    api.on("extract", () => billed({ jobId: "x-1" }, 5, 202));
    api.on("extract-poll", () => billed({ status: "completed", data: silentVisualNotes }, 0));
    api.always("ai", () => aiResponse(silentAnswer));
    const { body } = startJob(SILENT, "client", db);
    expect((await runNext(db)).status).toBe("succeeded");
    expect(creditsUsed(db)).toBe(8);
    const recipe = getRecipe(getJobStatus(body.jobId!, db)!.recipeId!, db)!;
    expect(recipe.extraction.stages).toEqual(["caption", "linked_recipe", "transcript", "visual", "normalize"]);
    // On-screen amounts verified against the visual notes; a guessed one isn't confirmed.
    expect(quantityLabel(recipe.ingredients.find((i) => i.name === "Matcha powder")!)).toBe("confirmed");
    expect(quantityLabel(recipe.ingredients.find((i) => i.name === "Ice")!)).toBe("suggested");
    expect(JSON.stringify(api.calls.find((c) => c.url.href.startsWith("https://openrouter.ai/"))!.body)).toContain("<<<SOURCE VISUAL_NOTES>>>");
  });

  // Real case (2026-11-22): music-only Reels made Supadata answer 400 "no audio track", which used to end the job
  // as "can't open this video".
  const noAudio = { error: "invalid-request", message: "Invalid Request", details: "This video has no audio track to transcribe" };
  const silentMeta = { ...meta.pasta, id: "SILENTreel1", description: "So good 😍 #matcha #latte", media: { type: "video", duration: 20 } };

  it.each([
    ["answered at once", () => api.on("transcript", () => billed(noAudio, 0, 400))],
    ["as a failed async job", () => (api.on("transcript", () => billed({ jobId: "t-1" }, 0, 202)), api.on("transcript-poll", () => billed({ status: "failed", error: noAudio }, 0)))],
  ])("no audio track (%s) means no speech: the visual pass runs", async (_n, mockTranscript) => {
    api.always("metadata", () => billed(silentMeta, 1));
    mockTranscript();
    api.on("extract", () => billed({ jobId: "x-1" }, 5, 202));
    api.on("extract-poll", () => billed({ status: "completed", data: silentVisualNotes }, 0));
    api.always("ai", () => aiResponse(silentAnswer));
    const { body } = startJob(SILENT, "client", db);
    expect((await runNext(db)).status).toBe("succeeded");
    expect(api.count("extract")).toBe(1);
    expect(getRecipe(getJobStatus(body.jobId!, db)!.recipeId!, db)!.extraction.stages).toEqual(["caption", "linked_recipe", "transcript", "visual", "normalize"]);
  });

  it("on-screen text needed but the daily cap blocks it → 'limited', not a cached 'not a recipe'", async () => {
    vi.stubEnv("SUPADATA_DAILY_CREDITS", "5");
    resetEnvForTests();
    api.always("metadata", () => billed(silentMeta, 1));
    api.on("transcript", () => billed(noAudio, 0, 400));
    api.always("ai", () => aiResponse({ ...silentAnswer, is_recipe: false, ingredients: [], steps: [] }));
    startJob(SILENT, "client", db);
    expect(await runNext(db)).toMatchObject({ status: "failed", error_code: "limited" });
    expect(api.count("extract")).toBe(0);
  });
});

describe("Instagram: inaccessible, unsuitable and incomplete Reels", () => {
  it.each([
    ["deleted (404)", 404, { error: "not-found", message: "Not Found", details: "The requested item could not be found" }],
    ["private (403)", 403, { error: "forbidden", message: "Forbidden" }],
  ])("%s → 'can't open this video', no AI call", async (_n, status, err) => {
    api.always("metadata", () => billed(err, 0, status));
    startJob(SOUP, "client", db);
    expect(await runNext(db)).toMatchObject({ status: "failed", error_code: "unavailable" });
    expect(api.count("ai")).toBe(0);
  });

  it("photo post → 'this post isn't a video'", async () => {
    api.always("metadata", () => billed({ ...meta.pasta, type: "image", media: { type: "image", url: "x" }, additionalData: { isVideo: false } }, 1));
    startJob(PASTA, "client", db);
    expect((await runNext(db)).error_code).toBe("not_a_video");
    expect(api.count("ai")).toBe(0);
  });

  it("nothing to read (no caption, no speech, visual pass not affordable) → not a recipe, without asking the AI", async () => {
    vi.stubEnv("SUPADATA_MAX_JOB_CREDITS", "3");
    resetEnvForTests();
    api.always("metadata", () => billed({ ...meta.turkey, description: "#fyp 🔥" }, 1));
    api.always("transcript", () => billed({ lang: "none", availableLangs: ["none"], content: [] }, 2));
    startJob(TURKEY, "client", db);
    expect(await runNext(db)).toMatchObject({ status: "failed", error_code: "not_a_recipe" });
    expect(api.count("extract")).toBe(0);
    expect(api.count("ai")).toBe(0);
  });

  it("the model finds no recipe in the text → not a recipe", async () => {
    api.always("metadata", () => billed(meta.pasta, 1));
    api.always("ai", () => aiResponse({ ...pastaAnswer, is_recipe: false, ingredients: [], steps: [] }));
    startJob(PASTA, "client", db);
    expect((await runNext(db)).error_code).toBe("not_a_recipe");
  });

  it("monthly Supadata allowance used up (429 usage limit) → 'limited', not retried", async () => {
    api.always("metadata", () => billed({ error: "limit-exceeded", details: "Plan usage limit was exceeded." }, 0, 429));
    startJob(PASTA, "client", db);
    expect(await runNext(db)).toMatchObject({ status: "failed", error_code: "limited", attempts: 1 });
  });

  it("our own credit caps refuse a call before it's made", async () => {
    vi.stubEnv("SUPADATA_DAILY_CREDITS", "2");
    resetEnvForTests();
    db.prepare("INSERT INTO processing_runs (job_id, stage, provider, status, credits, created_at) VALUES ('old', 'transcript', 'supadata', 'ok', 2, ?)").run(Date.now());
    startJob(PASTA, "client", db);
    expect((await runNext(db)).error_code).toBe("limited");
    expect(api.count("metadata")).toBe(0);
  });
});

describe("Instagram: retries and restarts don't pay twice", () => {
  it("a transient transcript failure is retried; the paid caption step isn't repeated", async () => {
    api.always("metadata", () => billed(meta.turkey, 1));
    api.on("transcript", () => billed({ error: "internal-error" }, 0, 503));
    api.always("transcript", () => billed(turkeyTranscript, 2));
    api.always("ai", () => aiResponse(turkeyAnswer));
    startJob(TURKEY, "client", db);
    expect(await runNext(db)).toMatchObject({ status: "queued", attempts: 1 });
    expect((await runNext(db, Date.now() + 60_000)).status).toBe("succeeded");
    expect(api.count("metadata")).toBe(1);
    expect(api.count("transcript")).toBe(2);
  });

  it("a worker killed while polling a transcript job resumes that job instead of starting (and paying for) a new one", async () => {
    api.always("metadata", () => billed(meta.turkey, 1));
    api.on("transcript", () => billed({ jobId: "t-42" }, 2, 202));
    api.always("transcript-poll", () => billed({ status: "active" }, 0));
    api.always("ai", () => aiResponse(turkeyAnswer));
    startJob(TURKEY, "client", db);
    const job = claimNextJob(db)!;
    const kill = new AbortController();
    const running = runInstagramJob({ db, job, signal: kill.signal, transport, setStage: () => {} });
    // Let it start the transcript job and poll a few times, then "kill the process".
    await new Promise((r) => setTimeout(r, 60));
    kill.abort(new Error("killed"));
    await expect(running).rejects.toBeTruthy();

    api.always("transcript-poll", (url) => {
      expect(url.pathname).toBe("/v1/transcript/t-42");
      return billed({ status: "completed", ...turkeyTranscript }, 0);
    });
    expect(recoverStaleJobs(db, 30_000, Date.now() + 60_000).requeued).toEqual([job.id]);
    expect((await runNext(db, Date.now() + 60_000)).status).toBe("succeeded");
    expect(api.count("transcript")).toBe(1); // one start, then polls only
    expect(api.count("metadata")).toBe(1);
  });

  it("a finished Reel is served from cache; joining an in-flight job doesn't duplicate it", async () => {
    api.always("metadata", () => billed(meta.pasta, 1));
    api.always("ai", () => aiResponse(pastaAnswer));
    const a = startJob(PASTA, "client", db);
    expect(startJob("https://instagram.com/reels/DWZqrugEacU", "other", db).body.jobId).toBe(a.body.jobId);
    await runNext(db);
    const again = startJob("https://www.instagram.com/p/DWZqrugEacU/", "other", db);
    expect(again.status).toBe(200);
    expect(api.count("metadata")).toBe(1);
    expect(api.count("ai")).toBe(1);
  });

  it("Instagram switched off: saved examples still work, other Reels are refused", () => {
    vi.stubEnv("INSTAGRAM_ENABLED", "false");
    resetEnvForTests();
    expect(startJob(PASTA, "client", db).status).toBe(202); // fixture example (simulated)
    expect(startJob(SILENT, "client", db)).toEqual({ status: 400, body: { error: "instagram_not_yet" } });
  });
});
