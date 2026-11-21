# M2 results: live YouTube processing (2026-11-21)

Pipeline `yt-1`, prompt `yt-prompt-1`, model `google/gemini-3.5-flash-lite` on Google AI Studio via OpenRouter
(the provider is pinned with no fallbacks, `reasoning.effort: minimal`, JSON output). Every number below comes from the
`processing_runs` table and the worker's structured logs. The real model answers are saved in
`tests/fixtures/live/` and re-checked offline by `tests/live-outputs.test.ts`.

## Real-video runs

"Job time" runs from claim to save. Latency is the time the AI call took.

| Video | Length | Result | Job time | AI latency | Tokens in/out (video) | Cost | Worst case reserved |
|---|---|---|---|---|---|---|---|
| Modern Nonna soup Short `VTR8vxBFGDY` | 0:27 | **complete**: 13 ingredients (11 confirmed, 2 optional "Not specified"), 8 steps | 13.8 s | 8.2 s | 4,676 / 2,934 (2,461) | **$0.0087** | $0.0192 |
| Kaju Katli Short `s4na199iyag` | 1:31 | **partial**: 5 ingredients, all "Not specified"; 8 steps | 5.7 s | 5.4 s | 9,656 / 1,530 (8,280) | **$0.0067** | $0.0247 |
| Carluccio carbonara `3AAdKl1UYZs` | 5:13 | **partial**: 9 ingredients (3 amounts from speech, 6 "Not specified"), 15 steps | 17.8 s | 12.5 s | 30,091 / 3,163 (28,407) | **$0.0169** | $0.0452 |
| Rick Astley music video `dQw4w9WgXcQ` (non-recipe) | 3:34 | **not_a_recipe**, shown as "This doesn't look like a recipe" | 4.5 s | 4.3 s | 21,371 / 99 | **$0.0067** | $0.0362 |
| `watch?v=privateDemo` (no such video) | – | **unavailable** at the metadata stage, no AI call | 0.2 s | – | – | $0 | – |
| `not a link`, TikTok, channel page, non-example Instagram Reel | – | Refused inline before any job (`invalid`, `unsupported_site`, `unsupported_path`, `instagram_not_yet`) | – | – | – | $0 | – |

**M2 AI spend: $0.0391** (4 billed calls). Including the spike's $0.0182, the cumulative total is **$0.0573**,
under the $0.20 development cap. Each call's cost came in well under its reserved worst case.

Afterwards:
- **Cache hits:** submitting the same three videos again in other URL forms (`youtu.be`, `?feature=share`) returned
  the saved recipe in about 5 ms, with no job.
- **Free re-normalising:** after the normalizer fixes I deleted the three saved recipes and resubmitted. Every stage
  was served from cache: metadata, linked page and the AI answer. Cost: $0.
- **Failures aren't paid for twice:** submitting the music video again reused the earlier `not_a_recipe` result
  with no new call.

## Accuracy and completeness

**Soup (YouTube description and linked blog recipe).**
- All 11 required amounts match the creator's description and the blog's JSON-LD: oil 2 tbsp, onion 1, carrots 2,
  celery 2 stalks, garlic 2 cloves, salt and pepper to taste, cauliflower 1 small head, potatoes 3 medium, broth
  4 cups, water 2 cups. Each was verified by the provenance guard against the text, with no warnings.
- Chives and bacon bits are optional and correctly "Not specified".
- Servings 3, prep 10, cook 30 and total 40 minutes all come from the linked recipe.
- Heat ("medium-high", "medium-low"), the time (25–30 min) and the doneness cues ("veggies are soft", "smooth")
  are kept.
- The 8 timestamps (0:06–0:24) match the caption-verified times from the spike to within about 1 s.
- **Missing:** "bring to a boil", which is on the blog but merged away.
- Cookable: **yes**.

**Kaju Katli (video only; the description just links another Reel).**
- Same as spike T2: 5 ingredients with no invented amounts, and 8 ordered steps with syrup and dough doneness cues.
- Honest gap: no times or heat levels.
- One creator "tip" is attributed to speech and can't be verified automatically.
- Cookable: **no** (no amounts), and the page says so.

**Carbonara (long-form; the "Recipe here" link is `goo.gl`, which no longer responds).**
- Spoken amounts are kept: salt "10 grams per litre of water", 2 eggs, 1 extra yolk (optional).
- Pasta, guanciale, olive oil, parmesan and pepper are "Not specified"; they aren't stated in the video.
- 15 steps follow Carluccio's method (no oil in the pasta water, render the guanciale, heat off before adding the
  eggs, toss so the eggs go creamy, not scrambled), with timestamps inside 5:13.
- Kept as creator notes: "never add cream"; pancetta and pecorino as alternatives.
- Small issues: "abundant" and "good" ended up as *preparation* text, and one doneness cue has a grammar slip.
- Cookable: **partly**. The method is clear, but proportions are missing because the written recipe is unreachable.

**Display.**
- Soup and Kaju were inspected in the browser, at phone (Pixel 7) and desktop (1280) sizes, through the progress
  page, overview and Cook Mode.
- Carbonara was checked through server-rendered HTML (overview and Cook Mode: title, amounts, "Not specified",
  "Step 1 of 15", "Watch this step") after macOS purged the Playwright browser (see Risks).
- Live stage progress seen in the browser: "Checking for the creator's written recipe…" (about 5 s, because of
  robots.txt and the redirect) → "Watching the video…" → redirect to the recipe.

## Issues found and fixed during the live runs

| Issue | Fix |
|---|---|
| The model repeats every missing amount in `gaps`, despite the prompt. | The normalizer drops gaps about quantities or amounts; the ingredient rows already show them. |
| Ingredient names came back lowercase ("olive oil"). | Capitalise the first letter. |
| The progress text fell back to "Starting…" for a moment after the last stage. | It now says "Done. Opening your recipe…". |
| A dead `goo.gl` link was logged as "robots.txt disallows". | It's now logged as "unreachable", and still not fetched. |
| There was no free way to check cost before a paid run. | `npm run estimate -- <url>` fetches the details and linked recipe, builds the exact request, and prints the worst-case cost. |

Found and fixed earlier while building with mocked APIs:
- normalizing `½` broke amount matching (NFKC turns it into `1⁄2`);
- error details could have stored a key echoed by an upstream error message (now redacted before the database);
- the robots.txt group matching was too loose.

## Not verified / limitations
- On-screen and visual claims, and anything attributed to speech, aren't checked automatically. The guard only
  verifies amounts claimed from text.
- An ingredient's preparation ("blended into a paste") shows on every step that uses it, even the earlier "wash" step.
- Recipe links behind dead shorteners (common in older descriptions) or blocked by robots.txt are skipped, so the
  recipe falls back to the video and description.
- An unknown recipe URL shows the "We can't find that recipe" page with `noindex`, but HTTP status 200 (streamed
  `notFound()`; same as M1).
