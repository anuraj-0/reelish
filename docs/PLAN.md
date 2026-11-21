# Reelish: architecture, data model and implementation plan

Status: **approved with adjustments**, 2026-11-21. Evidence: `spike/results/EVALUATION.md`.
Decisions are recorded in §6; they override anything earlier in this document.

Core insight from the spike: the video alone often lacks quantities. The creator's caption, description
or linked recipe usually has them. So we gather the **creator's text first** and run video, audio or
visual analysis only when it adds something.

---

## 1. What we keep from the spike

| Spike part | Verdict | Notes |
|---|---|---|
| `spike/` folder, results, reference recipes | **Keep, frozen** | Committed history. Spike outputs become offline test fixtures. |
| Provenance prompt rules (`PROMPT_V2`) | **Reuse** (port to TS) | Worked: no invented quantities; attribution held up in C2. |
| OpenRouter request shape | **Reuse** | Provider pinned to `google-ai-studio`, `reasoning.effort: minimal`, `response_format: json_object`, `usage.include`, `max_tokens`. |
| Worst-case cost guard and ledger | **Reuse the idea** | Becomes a budget check plus a `processing_runs` table. |
| Supadata request and poll pattern, credit header | **Reuse** | `x-billable-requests`; poll async jobs; send `lang` on transcript requests. |
| JSON-LD recipe parsing (scratchpad `jsonld.py`) | **Reuse the logic** | Port to TS; handle `HowToSection` and `@graph`. |
| Key redaction and `.env` loading | **Replace** | Use Next.js env plus a Zod-validated `env.ts`; keys are server-only. |
| Output JSON shape | **Refactor** | Loose snake_case becomes a strict Zod schema with ids, structured quantities and evidence lists. |
| Synchronous CLI flow, $0.20 constants, `key-check` format hints, CLI arguments | **Experiment-only** | Not carried over. |

---

## 2. Architecture

### Stack
- **Next.js (App Router) + TypeScript + Tailwind + shadcn/ui.** No reason to deviate.
- **Zod** for the recipe schema, LLM output validation, environment variables and API inputs.
- **On-server database behind a small repository module (`lib/db/`).** SQLite (a file under
  `/var/lib/reelish/`) for the MVP. If PostgreSQL is already on the VPS, we use a separate `reelish`
  database and role instead. Only `lib/db/` knows which one; the rest of the app calls functions like
  `getRecipe`, `claimNextJob` and `saveRecipe`. One database holds recipes, jobs and the source cache.
  No Redis and no queue service.
- **Background worker:** a second process from the same codebase (`npm run worker`) running as its own
  systemd unit, `reelish-worker`. It polls the jobs table. See "Jobs" below.
- **Vitest** for the `lib/` code, run against spike fixtures with no network. Playwright for one
  end-to-end smoke test, added later.
- The plain `fetch` API for HTTP. No provider SDKs, since each integration is 1–3 endpoints.

### Project structure
```
app/
  page.tsx                    # paste a link
  r/[id]/page.tsx             # recipe overview (shows progress while processing)
  r/[id]/cook/page.tsx        # Cook Mode
  api/recipes/route.ts        # POST {url} -> {recipeId, status}
  api/recipes/[id]/route.ts   # GET status + recipe
components/  ui/ (shadcn)  recipe/  cook/
lib/
  env.ts                      # Zod-validated server env
  schema/recipe.ts            # Zod: Recipe, Ingredient, Step, Evidence...
  schema/edits.ts             # user edits overlay
  labels.ts                   # internal source -> "Confirmed from creator" / "Suggested" / "Not specified"
  url.ts                      # parse, allowlist, canonicalize
  sources/youtube.ts          # YouTube Data API
  sources/instagram.ts        # Supadata
  sources/linked-recipe.ts    # safe fetch + JSON-LD
  pipeline/run.ts             # orchestrator (stages)
  pipeline/sufficiency.ts     # deterministic "is the text enough?"
  pipeline/normalize.ts       # LLM call, Zod validation, provenance guard
  llm/openrouter.ts
  db/schema.ts, db/client.ts
  budget.ts  ratelimit.ts  log.ts
tests/fixtures/               # copied from spike/results + spike/truth
docs/PLAN.md, docs/PLATFORM-CONSTRAINTS.md
spike/                        # frozen
```

### Request flow (both platforms)
1. `POST /api/recipes {url}` →
   1. parse and allowlist the URL;
   2. build the canonical key `youtube:<id>` or `instagram:<shortcode>`;
   3. look up the cache: if a recipe exists for this key and pipeline version, **return it immediately**;
   4. if a job for the same key is already running, **return that job** (deduplication);
   5. otherwise check the rate limit and budget, insert a `jobs` row (`status: queued`) and return
      `{jobId}`. The HTTP request never waits for processing.
2. The browser goes to `/r/[id]` right away. While the status is `processing`, the page polls
   `GET /api/recipes/[id]` about every 1.5 s and shows **named stages**:
   "Reading the caption…" → "Checking the creator's recipe…" → "Listening to the video…" →
   "Writing your recipe…".
   - Shows elapsed time, and after about 20 s: "Instagram videos take up to a minute."
   - The page is a bookmarkable URL, so users can leave and come back.
3. Once finished, the same page renders the overview. Cook Mode is `/r/[id]/cook`.

Why polling and not SSE or websockets: it's the simplest thing that works on any host and survives page
reloads. The extra requests are negligible at our scale.

### Jobs (independent of HTTP request lifetimes)
- **`jobs` table:** `id`, `key`, `url`, `status` (`queued`, `running`, `succeeded`, `failed`),
  `stage`, `attempts`, `maxAttempts` (2), `lockedAt`, `heartbeatAt`, `errorCode`, `recipeId`,
  `createdAt`, `finishedAt`.
- **Worker loop:** every second, claim the oldest `queued` job atomically (`UPDATE … WHERE status =
  'queued'`), set `running` and `lockedAt`, run the stages, update `stage` and `heartbeatAt` as it goes,
  and finish with `succeeded` or `failed`. Concurrency is 2, a constant.
- **Timeouts:** each stage has its own timeout (§ timeouts), and the whole job is capped at 180 s.
- **Retries:** only `upstream_failed` errors are retried, up to `maxAttempts`, with backoff.
  `unavailable` and `not_a_recipe` fail immediately.
- **Recovery after restart:** on startup, and every minute, any `running` job whose `heartbeatAt` is
  older than 60 s goes back to `queued` if it has attempts left, otherwise to `failed`. Stage outputs
  are in the source cache, so a resumed job doesn't re-spend credits.
- **Shutdown:** on SIGTERM, stop claiming jobs and let running ones finish within systemd's stop
  timeout. Anything still unfinished is recovered by the rule above.

### YouTube pipeline
1. **YouTube Data API `videos.list`**: title, description, channel, duration, thumbnail. 1 quota unit
   out of 10,000/day.
2. **Linked recipe:** find recipe links in the description (see §4) and fetch at most 2 pages.
3. **One Gemini call** with the YouTube URL plus all text sources, using the provenance prompt.
   - Spike numbers: about 4–6 s and $0.004–0.006 per Short.
   - Videos over **15 min** are rejected with a clear message for now (decision D5). We'll raise the
     limit after testing longer videos.
4. **Normalize and validate** (§4), then save.

### Instagram pipeline
Isolated in `lib/sources/instagram/`, behind one function, `fetchInstagramSources(shortcode)`. It can
be turned off with `INSTAGRAM_ENABLED=false`, because its reliability and platform permission are
still unresolved.

1. **Supadata metadata** (1 credit): caption, author, duration.
2. **Linked recipe** from the caption (as for YouTube). "Link in bio" can't be followed and is reported
   as missing.
3. **Sufficiency check** (no AI) on caption plus linked recipe. If sufficient, **skip to step 6.**
   *(Pasta salad case: 1 credit plus one AI call.)*
4. **Transcript** (2 credits/min, `mode=auto`, with `lang` set).
5. **Visual extract** (5 credits/min) **only if** the transcript is empty or very short **and** the
   text is still insufficient. In the spike it only re-read the burned-in captions.
6. **One text-only Gemini call** (about $0.003) to produce the recipe. *Not yet tested; first thing to
   validate in M3.*

### Failures and incomplete extractions
Every failure maps to a typed `ExtractionError` code with a user message and a next step.

| Case | Code | User sees |
|---|---|---|
| Not a YouTube or Instagram link | `unsupported_url` | Inline form error before any API call. |
| Private, deleted, age-restricted or region-locked | `unavailable` | "We can't access this video." Link to the original. |
| Upstream 5xx, timeout or rate limit (after a retry) | `upstream_failed` | "Try again" button. Not cached, so a retry runs fresh. |
| Not a cooking video | `not_a_recipe` | Says so. Cached, so it isn't re-billed. |
| Recipe found, quantities missing | `status: partial` | Full recipe with "Not specified" items and a banner saying the creator didn't give amounts; user can add their own. |
| AI output fails validation twice | `invalid_output` | Error plus a retry. The raw output is logged for debugging. |
| Budget or rate limit reached | `limited` | Friendly message; cached recipes still work. |

### Caching, timeouts, retries, rate limiting
- **Recipe cache:** keyed by `platform:id` plus `pipelineVersion`. Results are public videos, so one
  result serves every user. Bumping `pipelineVersion` triggers lazy reprocessing.
- **Source cache:** raw metadata, transcript, extract and linked-page responses are stored with a
  7-day TTL. Re-running after a prompt change then **doesn't re-spend Supadata credits**.
  YouTube Data API terms may limit how long we store API data; this needs checking (see constraints).
- **Timeouts:**

  | Call | Timeout |
  |---|---|
  | Data API | 10 s |
  | Linked page fetch | 8 s |
  | Supadata metadata | 20 s |
  | Transcript (including polling) | 90 s |
  | Extract | 120 s |
  | LLM | 60 s |
  | Whole job | 180 s, then `upstream_failed` |

- **Retries:** one retry with jittered backoff for network errors, 429 and 5xx on idempotent GETs.
  None on 4xx. The LLM gets one repair retry on validation failure.
- **Rate limiting:** about 10 *new* extractions per hour per IP (the IP is hashed, never stored raw),
  in the database. Cache hits don't count.
- **Budget guard:** environment caps such as `DAILY_AI_BUDGET_USD=1` and `MONTHLY_SUPADATA_CREDITS`.
  Spend is counted from `processing_runs` before each job starts.

### Security
- **API keys:** keys live only in server environment variables, never with `NEXT_PUBLIC_`.
  - `env.ts` validates them at boot; `import "server-only"` sits in `lib/sources` and `lib/llm`.
  - Logs pass through a redactor. `.env` stays gitignored, and a `.env.example` documents the names.
- **User URLs:**
  - Parse with `URL`.
  - Allowlist the hosts (`youtube.com`, `m.youtube.com`, `youtu.be`, `instagram.com` with
    `/reel/`, `/reels/` or `/p/`) and extract the ID.
  - **Rebuild the canonical URL ourselves.** The raw user string never reaches a fetcher.
- **Linked-recipe fetches (SSRF risk):**
  - https only, default port only.
  - Resolve DNS and block private, loopback, link-local and metadata IPs.
  - Follow redirects manually, at most 3, re-checking each hop.
  - 2 MB limit, `text/html` only, `robots.txt` respected.
  - Identifying user agent `ReelishBot (+contact URL)`.
- **Untrusted text into the AI (prompt injection):** captions and blog pages are wrapped as clearly
  labelled data. The model has no tools, and its output is only Zod-validated data, so the worst case
  is a wrong recipe. The provenance guard limits that.
- **Rendering:** React escaping only, no `dangerouslySetInnerHTML`. External links are http(s) only,
  with `rel="noopener noreferrer nofollow"`.

### Unresolved platform-permission constraints
These go in `docs/PLATFORM-CONSTRAINTS.md`.
- **Instagram via Supadata:**
  - Supadata is unofficial and scraping-based, and its terms make *us* "solely responsible" for
    complying with platform terms.
  - Instagram's terms prohibit unauthorized automated collection. *Meta v. Bright Data* (2024, one
    lower-court ruling) favoured logged-out scraping of public data. **Not settled. Acceptable for an
    MVP or beta only as a documented risk.**
- **Gemini YouTube URL input:** a **preview** feature; pricing and limits may change.
- **YouTube Data API:** the API Services Terms and Developer Policies (attribution, data storage and
  refresh limits) need reading before launch.
- **Linked recipe pages:** ingredient lists are largely factual, but the method text is the creator's.
  We show a normalized recipe with **clear credit and a prominent link to the original**, and never
  republish whole pages.
- **Embeds:** the YouTube iframe (with seek-to-timestamp) is fine. Instagram oEmbed may be used only
  for display.

---

## 3. Recipe data model (Zod, sketch)

```ts
// Internal provenance. Detailed, never shown raw to users.
export const SourceKind = z.enum([
  "video_speech",          // said in the video
  "video_on_screen_text",  // creator's text overlay
  "video_visual",          // seen, e.g. a carton label or garnish
  "caption",               // Instagram caption
  "description",           // YouTube description
  "linked_recipe",         // creator's linked recipe page (JSON-LD)
  "model_estimate",        // inferred; never for quantities unless explicitly marked
  "user",                  // added or edited by the user (edits overlay only)
]);

export const Evidence = z.object({
  source: SourceKind,
  excerpt: z.string().max(200).optional(),          // short supporting text, for text sources
  videoTimestampSec: z.number().nonnegative().optional(),
  url: z.string().url().optional(),                 // for linked_recipe
});

export const Quantity = z.object({
  raw: z.string(),                                  // exactly as stated: "½–1 tbsp", "a touch"
  amount: z.number().positive().nullable(),         // 0.5
  amountMax: z.number().positive().nullable(),      // 1 (ranges)
  unit: z.string().nullable(),                      // "tbsp", "g", "cup", null for counts
});

export const Status = z.enum(["stated", "suggested", "missing"]);

export const Ingredient = z.object({
  id: z.string(),
  name: z.string(),
  group: z.string().nullable(),                     // "Dressing", "Crispy pasta"
  quantity: Quantity.nullable(),
  quantityStatus: Status,                           // missing => quantity null
  preparation: z.string().nullable(),               // "finely diced"
  optional: z.boolean().default(false),
  evidence: z.array(Evidence).min(1),
});

export const Step = z.object({
  id: z.string(),
  text: z.string(),
  ingredientIds: z.array(z.string()),
  duration: z.object({ raw: z.string(), minSec: z.number().nullable(), maxSec: z.number().nullable() }).nullable(),
  temperature: z.object({ raw: z.string(), value: z.number().nullable(), unit: z.enum(["C", "F"]).nullable() }).nullable(),
  heat: z.enum(["low", "medium-low", "medium", "medium-high", "high"]).nullable(),
  doneCue: z.string().nullable(),                   // "until golden"
  videoTimestampSec: z.number().nullable(),         // only if said/shown in the video
  evidence: z.array(Evidence).min(1),
});

export const Conflict = z.object({
  path: z.string(),                                 // "ingredients.ing_3.quantity"
  description: z.string(),
  chosen: SourceKind,
  alternatives: z.array(z.object({ value: z.string(), source: SourceKind })),
});

export const Recipe = z.object({
  id: z.string(),
  schemaVersion: z.literal(1),
  source: z.object({
    platform: z.enum(["youtube", "instagram"]),
    videoId: z.string(),
    url: z.string().url(),                          // canonical, rebuilt by us
    creator: z.object({ name: z.string().nullable(), handle: z.string().nullable() }),
    title: z.string().nullable(),
    thumbnailUrl: z.string().url().nullable(),
    linkedRecipeUrls: z.array(z.string().url()),
  }),
  title: z.string(),
  servings: z.object({ raw: z.string(), value: z.number().nullable(), evidence: z.array(Evidence) }).nullable(),
  totalTime: z.object({ raw: z.string(), evidence: z.array(Evidence) }).nullable(),
  ingredients: z.array(Ingredient),
  steps: z.array(Step),
  conflicts: z.array(Conflict),
  gaps: z.array(z.string()),                        // "No oven temperature given"
  extraction: z.object({
    status: z.enum(["complete", "partial", "not_a_recipe"]),
    pipelineVersion: z.string(),
    stages: z.array(z.string()),                    // ["metadata", "transcript", "normalize"]
    createdAt: z.string(),
  }),
});

// User edits: a separate overlay; the original is never modified.
export const RecipeEdits = z.object({
  recipeId: z.string(),
  ingredients: z.record(z.string(), z.object({ quantity: Quantity.nullable().optional(), name: z.string().optional(), preparation: z.string().nullable().optional() })),
  addedIngredients: z.array(Ingredient),            // evidence: [{ source: "user" }]
  steps: z.record(z.string(), z.object({ text: z.string().optional() })),
  servings: z.number().nullable().optional(),
  updatedAt: z.string(),
});
```

**UI labels** (`lib/labels.ts`, one pure function):

| Shown to the user | Internal sources |
|---|---|
| **Confirmed from creator** | `video_speech`, `video_on_screen_text`, `caption`, `description`, `linked_recipe` |
| **Suggested** | `video_visual`, `model_estimate` |
| **Not specified** | `quantityStatus: missing` |
| **Edited by you** | anything in the edits overlay (with "revert") |

**Edits** are merged at render time with `applyEdits(recipe, edits)`, so the original is always
recoverable.

---

## 4. Processing strategy

**Sufficiency rule.** Deterministic, no AI, and tuned against spike fixtures. Text is *sufficient*
when either:
- a linked page has a JSON-LD `Recipe` with at least 3 `recipeIngredient` and at least 1 instruction;
  or
- the caption or description has **at least 3 ingredient lines with quantities** (number, fraction or
  unicode fraction followed by a unit or count) **and** at least 2 instruction-like lines (numbered,
  or imperative cooking verbs).

On the spike Reels, pasta salad (I2) counts as sufficient. Soup (I1) is sufficient only through its
linked recipe. Turkey (I3) is insufficient, so it goes to transcript and then extract. Extract won't
find quantities there either, so the result is `partial`.

**Linked recipe discovery.** URLs in the caption or description:
- drop social, shortener, affiliate and store domains with a small denylist;
- prefer the creator's own domain;
- fetch at most 2 pages, JSON-LD only. No HTML scraping fallback in the MVP *(decision D6)*.

**Avoiding unnecessary calls:**
- check caches first;
- deduplicate in-flight jobs;
- run stages in cost order and stop early;
- run visual extract only when there's no speech *and* the text is insufficient;
- cache raw source responses so reprocessing is free.

**Provenance guard.** Runs after the AI call, deterministic.
- Evidence citing a source we didn't provide (e.g. `linked_recipe` when none was fetched) is
  **removed**. An item left with no evidence is downgraded to "suggested" or "missing".
- For text sources, a `stated` quantity must appear (normalized) in that source's text. Otherwise it's
  downgraded to `suggested`, and a warning is logged.
- Video-sourced claims can't be checked automatically. The spike's speech timestamps were within
  about 1 s, but on-screen and visual claims stay unverified.

**Conflicts.** The AI reports them in `conflicts`. On top of that, a deterministic check flags the same
ingredient with quantities from different sources that differ after unit normalization (e.g. 32 oz vs
4 cups → equal, no conflict).

**Observability.** One `processing_runs` row per stage:

| Field | Example |
|---|---|
| `recipeId`, `stage`, `provider` | `transcript`, `supadata` |
| `status`, `errorCode` | `ok`, `upstream_failed` |
| `latencyMs` | 18100 |
| `inputTokens`, `outputTokens`, `costUsd` | from OpenRouter usage |
| `credits` | from the Supadata header |

These are written as structured JSON logs (one line per stage, redacted, collected by journald on the
VPS), plus the `processing_runs` table. **No dashboard in the MVP.** `npm run eval` produces a Markdown
report with accuracy, cost and latency on the test set.

---

## 5. Implementation plan

Each milestone ends with something working, plus tests.

| # | Milestone | Done when |
|---|---|---|
| **M0** | Scaffold: Next.js, TS, Tailwind, shadcn/ui, ESLint, Vitest; `env.ts`; Zod schema + `labels.ts` + `applyEdits` + quantity parser; spike outputs copied into `tests/fixtures/` | App boots; schema/label/edit/parser unit tests pass |
| **M1** | **Full UI journey on fixture data**: paste page → overview (ingredient groups, labels, Not specified, conflicts, gaps, link to original) → Cook Mode (one step per screen, step quantities, large tap targets, Wake Lock, YouTube seek-to-step) → **inline quantity edits** in localStorage with revert | Click-through with the soup and turkey fixtures on a phone; edits survive reload |
| **M2** | YouTube end to end: URL parser + allowlist, Data API, safe linked-recipe fetch + JSON-LD, Gemini call, Zod + repair retry, provenance guard, SQLite storage + recipe cache, job + polling page | Pasting the soup Short gives a cookable recipe with timestamps; fixture tests for guard and parser; SSRF tests |
| **M3** | Instagram end to end: Supadata metadata → sufficiency → transcript → extract fallback → text-only AI call; stage-by-stage progress UI; source cache | The 3 test Reels give the expected complete/partial results; credit use per Reel matches the plan |
| **M4** | Hardening: error states, timeouts/retries, worker recovery, rate limit, budget caps, structured logs, `PLATFORM-CONSTRAINTS.md`, `npm run eval` report (offline fixtures; optional live mode for the 6 test URLs with a spend cap) | Eval report on the 6 URLs; deliberate failure cases show the right messages; killing the worker mid-job recovers |
| **M5** | Deploy to the existing VPS: **inspect first, change nothing existing without approval**. Separate Linux user, `/opt/reelish`, its own port, its own env file (`/etc/reelish/env`, mode 600), its own database, the systemd units `reelish-web` + `reelish-worker`, and a new Nginx server block for the Reelish domain only | Live URL; DeepClean.app untouched and still healthy |
| Later | Serving scaling, unit conversion, step timers, adding new ingredients, Android share target / PWA, more platforms, a cost dashboard if logs aren't enough |

---

## 6. Decisions (resolved 2026-11-21)

| # | Decision |
|---|---|
| D1 | **Hosting:** the existing VPS (which also runs DeepClean.app), as an independent app behind Nginx with its own port, env, database and systemd services. Inspect before deploying; don't modify existing services without approval. |
| D2 | **Accounts:** none in the MVP. Edits, checked ingredients and Cook Mode progress live in the browser's localStorage. |
| D3 | **YouTube:** direct Gemini video processing, enriched with the creator's description and linked recipe. |
| D4 | **Instagram:** caption first, then transcript, then visual only if needed. Isolated module plus a feature flag; permission questions are documented, not resolved. |
| D5 | **Maximum video length:** 15 min to start. |
| D6 | **Linked recipes:** JSON-LD only for the MVP. |
| D7 | **Database:** on-server. SQLite by default; PostgreSQL with a separate DB and role if it's already installed. Access goes through `lib/db/` only. |
| D8 | **Background processing:** persisted jobs table plus a separate worker process (see "Jobs"). |
| D9 | **Cost tracking:** structured server logs plus the eval report. No dashboard. |
| D10 | **Edits:** stored as an overlay; the original extracted recipe is never modified. |

Prerequisites before M2: a free **YouTube Data API key**. Node 22 is available through nvm.
