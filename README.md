# Reelish

Paste a YouTube or Instagram cooking video and get a recipe you can actually cook from: a recipe
overview for prepping, and a focused Cook Mode for following the steps. Amounts the creator didn't
give are shown as **Not specified**, never guessed, and you can add your own.

**Status: M3.** YouTube videos and Shorts, and public Instagram Reels, are processed live.
- **YouTube:** Data API → the creator's linked recipe → Gemini watches the video.
- **Instagram:** Supadata caption → linked recipe → transcript only if needed → one text-only AI call.

See [docs/PLAN.md](docs/PLAN.md), [docs/M2-RESULTS.md](docs/M2-RESULTS.md),
[docs/M3-RESULTS.md](docs/M3-RESULTS.md) and [docs/PLATFORM-CONSTRAINTS.md](docs/PLATFORM-CONSTRAINTS.md).

## Run locally

Requires Node 22 (`nvm use` reads `.nvmrc`).

```bash
npm install
npm run dev            # http://localhost:3000
```

### Live mode (YouTube)

Put `YOUTUBE_API_KEY` and `OPENROUTER_API_KEY` in `.env.local` (or `.env`; see `.env.example`). With
both set the app runs live; otherwise it falls back to the saved fixtures. Instagram also needs
`SUPADATA_API_KEY` (and `INSTAGRAM_ENABLED=true`, the default). Keys stay on the server
(`lib/env.ts`) and must never be prefixed with `NEXT_PUBLIC_`.

```bash
npm run dev:all        # web app + background worker together (Ctrl-C stops both)
# or in two terminals:
npm run dev
npm run worker         # processes queued jobs; safe to stop/restart, jobs resume
```

Jobs, recipes and caches live in SQLite at `data/reelish.db` (`REELISH_DB_PATH` to change).

**Spend controls.** Each AI call reserves its worst-case cost before it runs. Calls are refused above
`MAX_JOB_COST_USD` (default 0.12) or when the last 24 h would exceed `DAILY_AI_BUDGET_USD` (default 1).
Supadata credits are capped separately (`SUPADATA_DAILY_CREDITS` 25, `SUPADATA_MONTHLY_CREDITS` 90,
`SUPADATA_MAX_JOB_CREDITS` 12; the free plan has 100/month). Each visitor can start
`RATE_LIMIT_PER_HOUR` new videos per hour (default 10; cache hits are free).
To check a video for free before paying:

```bash
npm run estimate -- https://www.youtube.com/shorts/VTR8vxBFGDY   # details, linked recipe, worst-case $; no AI call
```

Set `REELISH_PIPELINE=fixtures` to force the offline preview (the e2e tests do).

### Offline examples

## Checks

```bash
npm run check          # lint + typecheck + unit tests (Vitest)
npm run test:e2e       # Playwright journeys + axe accessibility scans, mobile and desktop
```

The e2e tests start a dev server on port 3100 (or reuse one) and use Playwright's full Chromium
(`npx playwright install chromium`). Set `SCREENSHOT_DIR=/some/dir` to save screenshots.

## Layout

```
app/                  routes: / (paste), /jobs/[id] (processing), /r/[id] (overview), /r/[id]/cook
components/           UI (recipe/, cook/, ui/ = shadcn)
hooks/                browser-only state (edits, checklist, cook progress) and screen wake lock
lib/recipe/           Zod schema, labels, edits overlay, quantity parser
lib/jobs/             job types, SQLite job store, start/dedup/rate-limit service, worker loop, fixture jobs
lib/pipeline/         YouTube and Instagram pipelines, shared AI call, prompts, sufficiency check,
                      normalizer + provenance guard
proxy.ts              returns a real 404 for unknown recipe ids
lib/sources/          YouTube Data API, SSRF-safe fetcher (robots.txt), linked-recipe JSON-LD,
                      instagram/ (provider interface + Supadata, isolated)
lib/llm/              OpenRouter client
lib/db/               SQLite (node:sqlite); the only module that knows the database
worker/               background worker entry (npm run worker)
lib/fixtures/         saved test recipes from the spike
lib/url.ts            link parsing: host allowlist, canonical URL
spike/                feasibility experiments and evaluation (frozen)
docs/PLAN.md          architecture and milestones
docs/M2-RESULTS.md    live YouTube test results, cost and latency
docs/M3-RESULTS.md    live Instagram test results, cost and latency
docs/PLATFORM-CONSTRAINTS.md  what each source permits; open questions
```
