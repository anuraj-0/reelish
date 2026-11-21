# M3 results: Instagram Reels (2026-11-21)

Pipeline `ig-1`, prompt `ig-prompt-1`. Supadata (free plan) for Reel details and transcripts; one text-only
call to `google/gemini-3.5-flash-lite` (OpenRouter, Google AI Studio). The real outputs are saved in
`tests/fixtures/live/ig-*.json` and re-checked offline by `tests/live-outputs.test.ts`.

## How a Reel is processed

| Stage | Cost | Runs when |
|---|---|---|
| Caption and details (Supadata metadata) | 1 credit | Always |
| Creator's linked recipe (JSON-LD, SSRF-safe fetch, robots.txt) | free | The caption has a link |
| Sufficiency check (deterministic, no AI) | free | Always |
| Transcript (Supadata, `mode=auto`, `lang=en`) | 1 credit (native) or 2 per minute (generated) | Caption and linked recipe aren't already a recipe |
| Visual notes (Supadata extract) | 5 per minute, minimum 5 | Still not enough **and** fewer than 15 spoken words |
| Recipe (one text-only AI call) | ~$0.005–0.010 | At least one source has content; otherwise "no recipe found" with no AI call |

Stages the job decides to skip disappear from the progress list.

## Real Reels

"Job" = worker time from claim to save. All three Reels were also opened in Recipe Overview and Cook
Mode at phone (Pixel 7) and desktop (1280) sizes, with no console errors (`docs/screenshots/m3-instagram/`).

| Reel | Stages actually needed | Result | Job | Supadata | AI |
|---|---|---|---|---|---|
| Crispy pasta salad `DWZqrugEacU` | caption | **Complete.** 12 ingredients in 3 groups, 6 steps | 13.3 s | 1 credit | $0.0065 |
| Modern Nonna soup `DQZd7W8EbPx` | caption → linked recipe | **Complete.** 13 ingredients (2 optional garnishes "Not specified"), 7 steps, serves 3 | 12.4 s | 1 credit | $0.0067 |
| Thanksgiving turkey `DPeUV0GjQnF` (as published today) | caption → linked recipe | **Complete.** 11 ingredients, 16 steps, serves 8 | 12.9 s | 1 credit | $0.0101 |
| Same turkey, recipe link made unreachable (to exercise the transcript path) | caption (cached) → transcript | **Partial.** 8 ingredients, all "Not specified"; 8 steps with transcript times 0:04–0:37; gaps: oven temperature, cooking time | 9.1 s | 1 credit | $0.0052 |
| Non-existent Reel `DZq9xYwVbN0` | caption → 404 | "We can't open this video", no AI call | 4.3 s | 0 (Supadata didn't bill the 404) | $0 |

Latency is dominated by Supadata metadata (5.0–5.5 s) and the AI call (6.7–7.8 s). The linked page took
0.4–1.2 s and the transcript 4.3 s.

**Spend:**
- **Supadata:** 4 credits. The account now shows 24 of 100 used this period, which matches the app's ledger. The
  ledger also reserved 1 credit for the failed 404 lookup, because billing of failures isn't documented.
- **OpenRouter:** M3 spent **$0.0284**. Cumulative across spike, M2 and M3: about **$0.086** of the $0.20
  development budget.
- **Cache hits:** re-opening all three Reels, and rebuilding their recipes after the normalizer fixes, cost
  $0 and 0 credits.

## Accuracy

**Pasta salad (caption only).**
- All 12 caption ingredients carry the caption's exact amounts: 150g, Drizzle, ¼ cup, ½ cup, 1 tbsp, 1/2-1 tbsp,
  to taste, 2 cups (½ head), ½, 1 cup, ¼ cup, ⅛ cup.
- Each amount was verified against the caption by the provenance guard: no warnings, all "Confirmed from creator".
- The creator's groups are kept (Crispy pasta / Yogurt dressing / The veg), as are 390°F, 10–12 min and "al dente".
- The creator's "skip the air fryer" note is kept.
- The blog version adds 1 tsp olive oil to the dressing, which the caption doesn't have; correctly not
  invented.
- Not given: servings (listed as a gap).

**Soup (caption is "Comment 'recipe'…" plus a link).**
- The page doesn't embed the Reel. It was accepted because the creator introduces the link as the recipe and the
  caption names no other dish.
- All 11 required amounts match the blog exactly. Heat, 25–30 min, the doneness cues and "bring to a boil" are kept.
- Minor: the blog's own aside ("no need to dice finely") became step 2.

**Turkey.**
- In the October spike the caption was empty. Today it links the creator's recipe, so the Reel is now
  complete: every amount matches the blog's JSON-LD.
- "1 5kg turkey (11 lbs)" is the blog's own odd wording, kept verbatim.
- Butter and beer appear twice (turkey and cheesecloth uses) without group headings.
- **Transcript path:** forced by making the link unreachable on a copy of the database.
  - It reproduces the spike: the method is clear, but there are no amounts, oven temperature or time.
  - All 8 amounts are honestly "Not specified" and the gaps say what's missing.
  - The visual pass was correctly skipped (the creator speaks).

**Visual-notes path:** covered by the mocked integration tests only. None of the three Reels needs it, and it
costs at least 5 credits.

## Issues found and fixed during M3

| Issue | Fix |
|---|---|
| Captions use invisible "blank" lines (U+2800), so "Comment 'recipe'" never sat next to the link. | Blank lines are skipped when scoring links. |
| The blog page doesn't embed the Reel, so it failed the relevance check. | A link the creator introduces as the recipe counts when the caption names no other dish. A mismatched page ("Chocolate Lava Cake") is still rejected. |
| A scoring change briefly let "his new book" inherit the "Recipe here:" context. | A line that holds its own link no longer gives context. |
| Transcripts split sentences ("…with a little bit" / "of beer"), and "an orange" doesn't contain "1". | Spoken amounts can span two transcript lines, and "a/an/one" counts as 1. Never applied to ingredient lists. |
| Caption headings in capitals ("CRISPY PASTA:"); "Freshly grated parmesan / freshly grated"; "Done when adjust to taste"; a lowercase gap. | Deterministic clean-ups in the normalizer. |
| **A link pasted before the page hydrated was ignored.** The field showed it, but tapping "Get the recipe" said "Paste a link". Reproduced 6/6. | Submit reads the field itself. The form also works without JavaScript (posts to `/start`). Both are e2e-tested. |

Before M3 started, two M2 issues were fixed:
- Cook Mode no longer shows "blended into a paste" before the step that blends.
- Unknown recipe links now return HTTP 404 (checked in Proxy before the page streams).

A regression test proves a finished recipe survives a worker and database restart without a second AI charge.

## Limitations
- Instagram thumbnails aren't shown: their URLs are signed and expire within days, so the pages use the
  no-image layout.
- Instagram links can't seek to a step. Cook Mode says "Open the video on Instagram" (with the time when the
  transcript gives one).
- Reels over about 6 minutes can't be transcribed under the per-job credit cap (12), and the job ends with
  "limited". Most Reels are under 3 minutes.
- The sufficiency check is a heuristic. A caption with amounts written inline in prose ("add 2 cups of…") may
  count as insufficient, which costs a transcript it didn't strictly need.
