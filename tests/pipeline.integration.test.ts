import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { spentLast24h } from "@/lib/budget";
import { openDb, setDbForTests, type Db } from "@/lib/db";
import { resetEnvForTests } from "@/lib/env";
import { getJobStatus, getRecipe, startJob } from "@/lib/jobs/service";
import { claimNextJob, getJob, recoverStaleJobs } from "@/lib/jobs/store";
import { processJob } from "@/lib/jobs/worker";
import { chat } from "@/lib/llm/openrouter";
import { fetchYoutubeVideo } from "@/lib/sources/youtube";
import type { Transport } from "@/lib/sources/safe-fetch";
import { Recipe } from "@/lib/recipe/schema";
import { soupLlmRaw } from "./fixtures/llm";
import { apiItem, recipePage, SOUP_DESCRIPTION } from "./fixtures/youtube";

const YT_KEY = "test-youtube-key-AIzaFAKE123456";
const OR_KEY = "sk-or-v1-testkeytestkeytestkey0000";
const SOUP_URL = "https://youtube.com/shorts/VTR8vxBFGDY?si=share";
const CLIENT = "client-a";

type Call = { url: string; init?: RequestInit; body?: Record<string, unknown> };

/** Stubs global fetch with the YouTube Data API and OpenRouter. Responses can be queued per service. */
function mockApis() {
  const calls: Call[] = [];
  const youtube: (() => Response)[] = [];
  const openrouter: (() => Response)[] = [];
  let youtubeDefault = () => Response.json({ items: [apiItem({ id: "VTR8vxBFGDY", title: "Mom & Dad taught me how to make the HEALTHIEST creamy soups", description: SOUP_DESCRIPTION, duration: "PT27S" })] });
  let openrouterDefault = () => aiResponse(soupLlmRaw);
  const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    if (url.startsWith("https://www.googleapis.com/youtube/v3/videos")) return (youtube.shift() ?? youtubeDefault)();
    if (url === "https://openrouter.ai/api/v1/chat/completions") return (openrouter.shift() ?? openrouterDefault)();
    throw new Error(`unexpected fetch ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  return {
    calls,
    youtube,
    openrouter,
    setYoutube: (f: () => Response) => (youtubeDefault = f),
    setOpenrouter: (f: () => Response) => (openrouterDefault = f),
    count: (prefix: string) => calls.filter((c) => c.url.startsWith(prefix)).length,
  };
}

function aiResponse(content: unknown, cost = 0.0056) {
  return Response.json({
    id: "gen-1",
    provider: "Google AI Studio",
    model: "google/gemini-3.5-flash-lite",
    choices: [{ finish_reason: "stop", message: { role: "assistant", content: typeof content === "string" ? content : JSON.stringify(content) } }],
    usage: { prompt_tokens: 3263, completion_tokens: 1839, cost, prompt_tokens_details: { video_tokens: 2461 } },
  });
}

const page = "https://www.themodernnonna.com/healthiest-cream-of-hidden-veggie-soup/";
const transport: Transport = async (url) => {
  if (url.pathname === "/robots.txt") return { status: 404, headers: {}, body: "", truncated: false };
  if (url.toString() === page) return { status: 200, headers: { "content-type": "text/html" }, body: recipePage({ name: "Creamy Vegetable Soup", embedVideoId: "VTR8vxBFGDY" }), truncated: false };
  return { status: 404, headers: {}, body: "", truncated: false };
};

async function runNext(db: Db, now = Date.now()) {
  const job = claimNextJob(db, now);
  if (!job) throw new Error("no job to run");
  await processJob(db, job, { transport });
  return getJob(db, job.id)!;
}

let db: Db;
let api: ReturnType<typeof mockApis>;

beforeEach(() => {
  db = openDb(":memory:");
  setDbForTests(db);
  vi.stubEnv("YOUTUBE_API_KEY", YT_KEY);
  vi.stubEnv("OPENROUTER_API_KEY", OR_KEY);
  vi.stubEnv("REELISH_PIPELINE", "live");
  vi.stubEnv("REELISH_LOG", "silent");
  resetEnvForTests();
  api = mockApis();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  resetEnvForTests();
  setDbForTests(undefined);
  db.close();
});

describe("YouTube job, end to end with mocked APIs", () => {
  it("creates a job, runs every stage, saves a valid recipe and logs cost", async () => {
    const start = startJob(SOUP_URL, CLIENT, db);
    expect(start.status).toBe(202);
    const jobId = start.body.jobId!;
    expect(getJobStatus(jobId, db)).toMatchObject({ status: "queued", stages: [{ key: "metadata", state: "pending" }, {}, {}, {}] });

    const row = await runNext(db);
    expect(row.status).toBe("succeeded");
    const status = getJobStatus(jobId, db)!;
    expect(status.stages.map((s) => s.state)).toEqual(["done", "done", "done", "done"]);
    const recipe = getRecipe(status.recipeId!, db)!;
    expect(Recipe.safeParse(recipe).success).toBe(true);
    expect(recipe.source).toMatchObject({ videoId: "VTR8vxBFGDY", url: "https://www.youtube.com/watch?v=VTR8vxBFGDY", linkedRecipeUrls: [page] });
    expect(recipe.extraction.status).toBe("complete");

    // The request matches the spike's working configuration, and uses our canonical URL.
    const ai = api.calls.find((c) => c.url.includes("openrouter"))!;
    expect(ai.body).toMatchObject({
      model: "google/gemini-3.5-flash-lite",
      provider: { order: ["google-ai-studio"], allow_fallbacks: false },
      reasoning: { effort: "minimal" },
      response_format: { type: "json_object" },
      usage: { include: true },
    });
    const parts = (ai.body!.messages as { content: { type: string; text?: string; video_url?: { url: string } }[] }[])[0].content;
    expect(parts.find((p) => p.type === "video_url")?.video_url?.url).toBe("https://www.youtube.com/watch?v=VTR8vxBFGDY");
    const text = parts.map((p) => p.text ?? "").join("\n");
    expect(text).toContain("<<<SOURCE DESCRIPTION>>>");
    expect(text).toContain("<<<SOURCE LINKED_RECIPE>>>");
    expect(text).toContain("This page embeds the video: yes");

    // Keys travel in headers only.
    const yt = api.calls.find((c) => c.url.includes("googleapis"))!;
    expect(yt.url).not.toContain(YT_KEY);
    expect((yt.init!.headers as Record<string, string>)["X-goog-api-key"]).toBe(YT_KEY);

    const runs = db.prepare("SELECT stage, provider, status, cost_usd, input_tokens, output_tokens FROM processing_runs ORDER BY id").all();
    expect(runs).toEqual([
      expect.objectContaining({ stage: "metadata", provider: "youtube_data_api", status: "ok" }),
      expect.objectContaining({ stage: "linked_recipe", provider: "creator_site", status: "ok" }),
      expect.objectContaining({ stage: "video", provider: "openrouter", status: "ok", cost_usd: 0.0056, input_tokens: 3263, output_tokens: 1839 }),
      expect.objectContaining({ stage: "normalize", status: "ok" }),
    ]);
    expect(spentLast24h(db)).toBeCloseTo(0.0056, 6);
  });

  it("serves a finished recipe from cache without new calls", async () => {
    startJob(SOUP_URL, CLIENT, db);
    await runNext(db);
    const before = api.calls.length;
    const again = startJob("https://www.youtube.com/watch?v=VTR8vxBFGDY", "someone-else", db);
    expect(again.status).toBe(200);
    expect(again.body.recipeId).toMatch(/^yt-VTR8vxBFGDY-/);
    expect(api.calls.length).toBe(before);
  });

  it("joins an in-flight job instead of creating a duplicate", () => {
    const a = startJob(SOUP_URL, CLIENT, db);
    const b = startJob("https://youtu.be/VTR8vxBFGDY", "client-b", db);
    expect(b.body.jobId).toBe(a.body.jobId);
    expect((db.prepare("SELECT COUNT(*) AS n FROM jobs").get() as { n: number }).n).toBe(1);
  });

  it("retries a transient AI failure once, reusing the cached video details", async () => {
    api.openrouter.push(() => new Response(JSON.stringify({ error: { message: "upstream overloaded" } }), { status: 503 }));
    startJob(SOUP_URL, CLIENT, db);
    const first = await runNext(db);
    expect(first).toMatchObject({ status: "queued", attempts: 1 });
    expect(getJobStatus(first.id, db)?.status).toBe("running"); // shown as still working
    expect(getJobStatus(first.id, db)?.stages.slice(0, 2).map((s) => s.state)).toEqual(["done", "done"]);

    const second = await runNext(db, Date.now() + 60_000);
    expect(second.status).toBe("succeeded");
    expect(api.count("https://www.googleapis.com")).toBe(1);
    expect(api.count("https://openrouter.ai")).toBe(2);
  });

  it("gives up after the attempt limit and offers a retry that doesn't re-fetch cached inputs", async () => {
    api.setOpenrouter(() => new Response("{}", { status: 502 }));
    const { body } = startJob(SOUP_URL, CLIENT, db);
    await runNext(db);
    const failed = await runNext(db, Date.now() + 60_000);
    expect(failed).toMatchObject({ status: "failed", error_code: "upstream_failed", attempts: 2 });
    expect(getJobStatus(body.jobId!, db)?.stages.find((s) => s.state === "failed")?.key).toBe("video");

    api.setOpenrouter(() => aiResponse(soupLlmRaw));
    const retry = startJob(SOUP_URL, CLIENT, db);
    expect(retry.body.jobId).not.toBe(body.jobId);
    expect((await runNext(db)).status).toBe("succeeded");
    expect(api.count("https://www.googleapis.com")).toBe(1);
  });

  it("repairs malformed output with a text-only call (no second video read)", async () => {
    api.openrouter.push(() => aiResponse('{"is_recipe": true, "title": "Soup", "ingredients": "lots"}', 0.004));
    startJob(SOUP_URL, CLIENT, db);
    expect((await runNext(db)).status).toBe("succeeded");
    const aiCalls = api.calls.filter((c) => c.url.includes("openrouter"));
    expect(aiCalls).toHaveLength(2);
    const repairParts = (aiCalls[1].body!.messages as { content: { type: string }[] }[])[0].content;
    expect(repairParts.some((p) => p.type === "video_url")).toBe(false);
    expect((db.prepare("SELECT stage FROM processing_runs WHERE provider = 'openrouter' ORDER BY id").all() as { stage: string }[]).map((r) => r.stage)).toEqual(["video", "repair"]);
  });

  it("fails as invalid_output when the repair is also unusable, without caching the bad answer", async () => {
    api.setOpenrouter(() => aiResponse("not json at all", 0.001));
    startJob(SOUP_URL, CLIENT, db);
    const row = await runNext(db);
    expect(row).toMatchObject({ status: "failed", error_code: "invalid_output" });
    expect((db.prepare("SELECT COUNT(*) AS n FROM source_cache WHERE key LIKE 'ai:%'").get() as { n: number }).n).toBe(0);
  });

  it("records 'not a recipe' and shows it again without paying twice", async () => {
    api.setOpenrouter(() => aiResponse({ ...soupLlmRaw, is_recipe: false, title: "A music video", ingredients: [], steps: [] }, 0.002));
    const { body } = startJob(SOUP_URL, CLIENT, db);
    expect((await runNext(db)).error_code).toBe("not_a_recipe");
    const again = startJob(SOUP_URL, CLIENT, db);
    expect(again.body.jobId).toBe(body.jobId);
    expect(api.count("https://openrouter.ai")).toBe(1);
  });

  it("rejects videos over 15 minutes before any AI call", async () => {
    api.setYoutube(() => Response.json({ items: [apiItem({ id: "VTR8vxBFGDY", title: "Long", description: "", duration: "PT15M1S" })] }));
    startJob(SOUP_URL, CLIENT, db);
    expect((await runNext(db)).error_code).toBe("too_long");
    expect(api.count("https://openrouter.ai")).toBe(0);
  });

  it.each([
    ["deleted or private (no items)", { items: [] }],
    ["private", { items: [apiItem({ id: "VTR8vxBFGDY", title: "x", description: "", duration: "PT1M", privacy: "private" })] }],
    ["live stream", { items: [apiItem({ id: "VTR8vxBFGDY", title: "x", description: "", duration: "P0D", live: "live" })] }],
    ["age-restricted", { items: [apiItem({ id: "VTR8vxBFGDY", title: "x", description: "", duration: "PT1M", ytRating: "ytAgeRestricted" })] }],
  ])("fails as unavailable when the video is %s", async (_name, response) => {
    api.setYoutube(() => Response.json(response));
    startJob(SOUP_URL, CLIENT, db);
    expect((await runNext(db)).error_code).toBe("unavailable");
    expect(api.count("https://openrouter.ai")).toBe(0);
  });

  it("refuses to start an AI call that would exceed the daily budget", async () => {
    vi.stubEnv("DAILY_AI_BUDGET_USD", "0.005");
    resetEnvForTests();
    startJob(SOUP_URL, CLIENT, db);
    expect((await runNext(db)).error_code).toBe("limited");
    expect(api.count("https://openrouter.ai")).toBe(0);
  });

  it("limits how many new videos one visitor can submit per hour (cache hits don't count)", () => {
    vi.stubEnv("RATE_LIMIT_PER_HOUR", "2");
    resetEnvForTests();
    expect(startJob("https://youtu.be/AAAAAAAAAAA", CLIENT, db).status).toBe(202);
    expect(startJob("https://youtu.be/BBBBBBBBBBB", CLIENT, db).status).toBe(202);
    expect(startJob("https://youtu.be/CCCCCCCCCCC", CLIENT, db)).toEqual({ status: 429, body: { error: "rate_limited" } });
    expect(startJob("https://youtu.be/CCCCCCCCCCC", "another-visitor", db).status).toBe(202);
    // Joining an in-flight job isn't new work.
    expect(startJob("https://youtu.be/AAAAAAAAAAA", CLIENT, db).status).toBe(202);
  });

  it("recovers jobs whose worker died: requeue with attempts left, else fail", () => {
    startJob(SOUP_URL, CLIENT, db);
    const job = claimNextJob(db)!;
    const later = Date.now() + 60_000;
    expect(recoverStaleJobs(db, 30_000, later).requeued).toEqual([job.id]);
    claimNextJob(db, later); // attempt 2
    expect(recoverStaleJobs(db, 30_000, later + 60_000).failed).toEqual([job.id]);
    expect(getJob(db, job.id)).toMatchObject({ status: "failed", error_code: "upstream_failed" });
  });

  it("never writes API keys to logs or the database", async () => {
    vi.stubEnv("REELISH_LOG", "");
    const lines: string[] = [];
    vi.spyOn(console, "log").mockImplementation((l: string) => void lines.push(l));
    vi.spyOn(console, "error").mockImplementation((l: string) => void lines.push(l));
    api.openrouter.push(() => new Response(JSON.stringify({ error: { message: `bad key ${OR_KEY}` } }), { status: 500 }));
    startJob(SOUP_URL, CLIENT, db);
    await runNext(db);
    await runNext(db, Date.now() + 60_000);
    const everything = [lines.join("\n"), JSON.stringify(db.prepare("SELECT * FROM processing_runs").all()), JSON.stringify(db.prepare("SELECT * FROM jobs").all())].join("\n");
    expect(lines.length).toBeGreaterThan(3);
    expect(everything).not.toContain(YT_KEY);
    expect(everything).not.toContain(OR_KEY);
    vi.restoreAllMocks();
  });
});

describe("Instagram in live mode (until M3)", () => {
  it("keeps the saved examples working and explains other links aren't supported yet", () => {
    expect(startJob("https://www.instagram.com/reel/DWZqrugEacU/", CLIENT, db).status).toBe(202);
    expect(startJob("https://www.instagram.com/reel/Cxyz123abc/", CLIENT, db)).toEqual({ status: 400, body: { error: "instagram_not_yet" } });
  });
});

describe("source error mapping", () => {
  it("YouTube quota and key errors aren't retried; 5xx are", async () => {
    api.youtube.push(() => Response.json({ error: { errors: [{ reason: "quotaExceeded" }] } }, { status: 403 }));
    await expect(fetchYoutubeVideo("VTR8vxBFGDY")).rejects.toMatchObject({ code: "upstream_failed", retryable: false });
    api.youtube.push(() => new Response("", { status: 503 }));
    await expect(fetchYoutubeVideo("VTR8vxBFGDY")).rejects.toMatchObject({ code: "upstream_failed", retryable: true });
  });

  it("OpenRouter: media errors mean unavailable, 429 is retryable, inline errors are caught", async () => {
    api.openrouter.push(() => Response.json({ error: { message: "Cannot fetch content from the provided YouTube URL" } }, { status: 400 }));
    await expect(chat([{ type: "text", text: "x" }], { timeoutMs: 1000 })).rejects.toMatchObject({ code: "unavailable" });
    api.openrouter.push(() => Response.json({ error: { message: "rate limited" } }, { status: 429 }));
    await expect(chat([{ type: "text", text: "x" }], { timeoutMs: 1000 })).rejects.toMatchObject({ code: "upstream_failed", retryable: true });
    api.openrouter.push(() => Response.json({ choices: [{ error: { code: 502, message: "provider died" }, message: { content: "" } }] }));
    await expect(chat([{ type: "text", text: "x" }], { timeoutMs: 1000 })).rejects.toMatchObject({ code: "upstream_failed", retryable: true });
    api.openrouter.push(() => Response.json({ error: { message: "Insufficient credits" } }, { status: 402 }));
    await expect(chat([{ type: "text", text: "x" }], { timeoutMs: 1000 })).rejects.toMatchObject({ code: "limited" });
  });
});
