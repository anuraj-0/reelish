# Reelish

Paste a YouTube or Instagram cooking video and get a recipe you can actually cook from: a recipe
overview for prepping, and a focused Cook Mode for following the steps. Amounts the creator didn't
give are shown as **Not specified**, never guessed, and you can add your own.

**Status: M1 (UX preview).** The app runs on four saved test recipes from the feasibility spike, with
simulated processing jobs. Live YouTube/Instagram processing is M2/M3; see [docs/PLAN.md](docs/PLAN.md).

## Run locally

Requires Node 22 (`nvm use` reads `.nvmrc`).

```bash
npm install
npm run dev            # http://localhost:3000
```

No API keys are needed for M1. For later milestones, copy `.env.example` to `.env.local`. Keys are
read on the server only (`lib/env.ts`) and must never be prefixed with `NEXT_PUBLIC_`.

Try the examples on the home page:
- Creamy Vegetable Soup (YouTube): complete recipe from the creator's linked recipe
- Viral Crispy Pasta Salad (Instagram): recipe from the caption
- Juicy Roast Turkey (Instagram): **missing quantities**
- Kaju Katli Sparklers (YouTube): silent video, no amounts at all
- A private video: failure state

Any other valid link shows an honest "live processing isn't switched on yet" message.

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
lib/jobs/             job types (shared with M2) and the M1 simulated job store
lib/fixtures/         saved test recipes from the spike
lib/url.ts            link parsing: host allowlist, canonical URL
spike/                feasibility experiments and evaluation (frozen)
docs/PLAN.md          architecture and milestones
```
