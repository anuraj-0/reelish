# M4 evaluation (2026-11-21)

Ten real links, scored on three separate questions:

- **Technical:** was the video processed, or correctly refused?
- **Extraction:** does the recipe match what the creator actually published?
- **Usability:** could someone cook from it?

**Status: historical results only.** Every row below comes from the live runs in M2 and M3: the `jobs` and
`processing_runs` tables in `data/reelish.db`, and `docs/M3-RESULTS.md` for row 9. The recipes were rebuilt
from cached AI answers by the current normalizer, at $0. **No fresh paid runs have been made in M4.** The
proposed fresh runs are at the end and are waiting for approval.

## How it was scored

- **Ground truth = the creator's own written text**: the YouTube description, the Instagram caption, or the
  schema.org Recipe on the creator's linked page (`spike/truth/*.json`, captured in the spike). The recipes in
  rows 1, 6, 7 and 8 were compared line by line against it.
- **Videos with no written recipe** (rows 2 and 3) can't be scored for accuracy without someone watching the
  video. I can't watch videos. For those rows I only check what can be checked from text: no amounts were
  invented, and the speech-attributed claims are listed for a human spot-check. They are marked
  **"not verified"**, not scored.
- **Ingredients:** creator ingredients present / creator ingredients. **Quantities:** amounts matching the creator /
  amounts the creator gave. An amount the creator never gave, shown as anything but "Not specified", counts as
  **unsupported**.
- **Steps:** every creator action present, in the creator's order.
- **Usable for cooking:** reviewer judgment from reading the recipe in the app. **This is not a cooking test.** No
  person has cooked from Reelish yet (see `docs/USABILITY-TEST.md`).
- **Time** = worker job time (claim → saved). **Cost** = OpenRouter cost as billed, plus Supadata credits.

## Results

| # | Link | Platform, length, creator | Creator's info available | Technical | Ingredients | Quantities | Steps | Unsupported | Time | Cost | Usable? |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | [youtube.com/shorts/VTR8vxBFGDY](https://www.youtube.com/shorts/VTR8vxBFGDY) | YT Short 0:27, The Modern Nonna | Full recipe in the description, plus a linked blog recipe | ✅ complete | 13/13 | 11/11 (2 optional garnishes "Not specified", as on the blog) | All, in order, except "bring to a boil" | 0 | 13.8 s | $0.0087 | **Yes** |
| 2 | [youtube.com/shorts/s4na199iyag](https://www.youtube.com/shorts/s4na199iyag) | YT Short 1:31, Foodie Gamer Adventures; Hindi narration; hashtag-only title | None. The description only links someone else's Reel | ✅ partial | not verified (5 named) | 0 invented; all 5 "Not specified" | 8, not verified | 0 amounts; steps not verifiable | 5.7 s | $0.0067 | **No**: no amounts, and the page says so |
| 3 | [youtube.com/watch?v=3AAdKl1UYZs](https://www.youtube.com/watch?v=3AAdKl1UYZs) | YT 5:13, Jamie Oliver channel (Antonio Carluccio) | Recipe link is a dead `goo.gl` link; the video speech only | ✅ partial | not verified (9 named) | 3 spoken amounts kept (not verified); 6 "Not specified" | 15, not verified | Servings "2" is attributed to speech: not verified | 17.8 s | $0.0169 | **Partly**: the method is clear, proportions are missing |
| 4 | [youtube.com/watch?v=dQw4w9WgXcQ](https://www.youtube.com/watch?v=dQw4w9WgXcQ) | YT 3:34 music video (non-recipe) | n/a | ✅ "doesn't look like a recipe" | n/a | n/a | n/a | n/a | 4.5 s | $0.0067 | Correct refusal |
| 5 | `youtube.com/watch?v=privateDemo` | Made-up id (not a real private video) | n/a | ✅ "can't open this video", no AI call | n/a | n/a | n/a | n/a | 0.2 s | $0 | Correct refusal |
| 6 | [instagram.com/reel/DWZqrugEacU](https://www.instagram.com/reel/DWZqrugEacU/) | IG Reel 0:19, @themodernnonna | Full recipe in the caption | ✅ complete | 12/12 | 12/12 | All (3 caption paragraphs → 6 steps), in order | 0 | 13.3 s | $0.0065 + 1 credit | **Yes** (no servings: the caption doesn't give them) |
| 7 | [instagram.com/reel/DQZd7W8EbPx](https://www.instagram.com/reel/DQZd7W8EbPx/) | IG Reel 0:25, @themodernnonna | Caption = "Comment 'recipe'" + a link to the blog recipe | ✅ complete | 13/13 | 11/11 (2 optional garnishes "Not specified") | All, including "bring to a boil"; one blog aside became step 2 | 0 | 12.4 s | $0.0067 + 1 credit | **Yes** |
| 8 | [instagram.com/reel/DPeUV0GjQnF](https://www.instagram.com/reel/DPeUV0GjQnF/) | IG Reel 0:41, @themodernnonna | Caption links the blog recipe | ✅ complete | 11/11 | 11/11, but the blog's "(11 lbs)" was dropped from "1 5kg" | All 16 actions, in order | 0 | 12.9 s | $0.0101 + 1 credit | **Yes**, with wording issues (below) |
| 9 | same Reel as 8, linked recipe made unreachable on a database copy | as 8 | Transcript only (forced) | ✅ partial | 8 named; the blog has 11 | 0 invented; all "Not specified" | 8; no oven temperature or time, listed as gaps | 0 | 9.1 s | $0.0052 + 1 credit | **No**: no temperature, time or amounts |
| 10 | `instagram.com/reel/DZq9xYwVbN0` | Non-existent Reel | n/a | ✅ "can't open this video", no AI call | n/a | n/a | n/a | n/a | 4.3 s | $0 (Supadata didn't bill the 404) | Correct refusal |

**Totals (rows 1–10):**
- 10/10 handled correctly (technical success).
- On the 4 recipes with a written creator source: **49/49 ingredients** and **45/45 amounts** match, with
  **0 unsupported quantities**.
- On the 3 recipes without one, 0 amounts were invented.
- AI cost per successful recipe: $0.0065–0.0169 (mean $0.0093). Instagram also uses 1 Supadata credit per
  Reel in these runs (row 9's transcript was native captions: 1 credit).
- Job time: 5.7–17.8 s for recipes, and 0.2–4.5 s for refusals.

### Extraction issues found in real outputs, and what changed

| Issue (real output) | Fix (explicit rule; no AI rewriting) | Verified on |
|---|---|---|
| Turkey "1 5kg" (blog: "1 5kg turkey (11 lbs)") reads as 15 kg | A count followed by a size ("1 5kg", "2 14 oz cans") is flagged as ambiguous and not parsed as a number. The row shows the creator's line as written: *Creator wrote: "1 5kg turkey (11 lbs)"*. The amount itself isn't changed or guessed | Real turkey output (`ig-turkey` fixture); it's the only flagged amount in the 7 real recipes |
| "Done when get golden", "Done when reading of 180F…" | A cue that starts with a bare verb gets "Done when it …" (*"Done when it gets golden"*). "reading/temperature of …" gets *"Done at a reading of …"*. Other cues are unchanged | Every cue in the 7 real recipes; none still starts "Done when get/come/turn…" |
| "every 40 minutes" (basting) shown with the timer icon | Intervals ("every/each …") are stored with no minutes and shown with a repeat icon (*"Every 40 minutes"*) | Real turkey output; it's the only interval among the real durations |
| Pasta step 6 repeated all 12 amounts; 5 below the buttons on a 375 px phone | Cook Mode shows an ingredient if it's first used in the step **or named in the instruction** (so reused ingredients stay: kaju "Roll in sugar", carbonara "Garnish with parmesan and pepper"). Others go under a collapsed **"Already added (n)"** | All 7 real recipes: no ingredient is ever dropped, and first uses are always shown (tests). Browser check below |
| One blog aside became a step (soup Reel step 2) | Not changed: it's harmless, and a rule to detect asides would be guesswork | – |
| "Done when pasta seems to be doing well" (carbonara) | Not changed: it's the model's paraphrase of speech; no safe rule | – |

**Browser check after the fixes:**
- The production build, with the 6 stored real recipes, at 375×667, 412×839, 768×1024, 1024×768 and 1280×800.
  Every Cook Mode step was stepped through.
- **298/300 step views** show the instruction and every "for this step" ingredient without scrolling.
  - Before the fixes, 3 steps were cut off at 375×667 and 1 on the Pixel 7. Tablet and desktop weren't measured
    then.
  - The remaining 2 are 5-ingredient steps at 1024×768 (turkey step 1, pasta step 5), where the fifth row sits
    just below the buttons.
- No axe violations (including with "Already added" open), no horizontal overflow, no console errors.

## Coverage

| Required | Covered by | Gap |
|---|---|---|
| YouTube Shorts and longer videos | 1, 2 (Shorts); 3 (5:13) | Nothing over 6 minutes; the 15-minute limit is untested live |
| Instagram Reels | 6–10 | |
| Different creators | 4 creators | **All Instagram rows are one creator (@themodernnonna)**, as is row 1 |
| Complete captions or linked recipes | 1, 6, 7, 8 | |
| Missing quantities or instructions | 2, 3, 9 | |
| Difficult video, minimal speech or on-screen text | (2 has Hindi narration, so it isn't minimal speech) | **Not covered.** The Instagram visual-notes path is mocked-test only |
| Non-recipe video | 4 | YouTube only |
| Inaccessible URL | 5, 10 | 5 is a made-up id, not a real private or removed video |
| Run-to-run consistency | spike only (soup: same result, timestamps ±3 s) | No repeat through the current pipeline |

## Fresh runs F1–F4: plan for approval (not run)

Checked on 2026-11-22 with free calls only:
- `npm run estimate` (YouTube Data API, no AI call);
- OpenRouter `GET /api/v1/key`;
- Supadata `GET /v1/me`, called twice; the used count didn't change, so it's free.

**Balances:**
- **OpenRouter:** $0.0858 used of the key's $20 limit ($19.91 left). This matches our ledger.
- **Supadata:** free plan, 24 of 100 credits used this period.

| # | Link | Checked | Expected path | Expected result | Expected cost | Worst case |
|---|---|---|---|---|---|---|
| F3 | [youtube.com/watch?v=kazwMSkeoSQ](https://www.youtube.com/watch?v=kazwMSkeoSQ) | 8,537 s (2:22:17) | metadata → refused "too long" | No AI call | $0 | $0 |
| F2 | [youtube.com/watch?v=UFmW_IaiLCM](https://www.youtube.com/watch?v=UFmW_IaiLCM): "Cozy Home Cooking ASMR … No Talking", channel "Crunch queen" | 317 s; the description names vegetables and spices, no amounts; no links | metadata → video (Gemini) | Partial with every amount "Not specified", or "doesn't look like a recipe". Any invented amount is a failure | $0.0154 | $0.0455 |
| F1 | [youtube.com/watch?v=i2AZRDIsMlc](https://www.youtube.com/watch?v=i2AZRDIsMlc): Food52 with Joshua Weissman, "Giant Baseball Cookies" | 808 s (13:28); the recipe link `f52.co/3QAzlJq` returns 404; the description has chapters, no ingredients | metadata → linked recipe (fails) → video | Partial: spoken amounts only | $0.0295 | $0.0905 |
| F4 | **Instagram Reel from another creator: not found yet** (see below) | – | caption → (linked recipe) → transcript if needed | depends | ~$0.007 + 1–3 credits | $0.017 + 12 credits (per-job cap) |

**Totals:**
- **Expected:** about $0.052 and 1–3 credits.
- **Worst case:** $0.153 and 12 credits.
- **Cumulative spend would be about $0.14 expected.** That's inside the $0.20 development cap and far inside the $20
  key limit.
- **Order and stop rule:** F3 → F4 → F2 → F1, one at a time. Before F1, check that actual spend plus F1's worst
  case ($0.0905) stays ≤ $0.20; otherwise ask first.
- The app's caps also apply: $0.12 per call, $1 per 24 h, 12 credits per job.

**F4: why there's no link yet.**
- **What "confirm" means here:** before proposing a Reel, I wanted to see that it really is a recipe Reel, by
  seeing its caption (or the creator's written recipe for it).
- **There are only two ways to see a Reel's caption:**
  - **Read Instagram itself** (the Reel page, or its public embed page). That's the kind of direct Instagram
    access our constraints doc says we have no permission for, so I didn't do it without asking.
  - **Use Supadata's metadata lookup.** It costs 1 credit, and you asked for no paid calls before approval.
- **The indirect routes didn't give a usable link** (checked 2026-11-22):
  - Creator blogs: Busy in Brooklyn's "Instagram Reel Recipes" posts, plus Cooking with Ayeh, Feel Good Foodie,
    Half Baked Harvest, RecipeTin Eats and Le Creme de la Crumb (10 recent posts each). No `/reel/` links in the
    page HTML.
  - News articles about viral recipe creators: they embed TikToks.
  - A food roundup that embeds Instagram: only 2016–2018 photo posts, not Reels.
  - Web search: Instagram profiles only; captions of individual Reels aren't indexed.
- **So no Reel has been checked or chosen.** Options:
  1. **You send a Reel link** you've seen is a recipe from a creator other than @themodernnonna. This is the
     fastest, and confirming it costs nothing.
  2. **Approve 1 Supadata credit** to read a candidate's caption before the AI call. This still needs a candidate
     link (from you or option 3).
  3. **Approve me reading Instagram's public embed page** for a creator, to pick a candidate. It's free, but it
     is direct Instagram access, so it's your call.

**What will be kept for each run:**
- in `docs/eval/<id>/`: source URL; raw model answer; normalized recipe JSON; the `jobs` row and
  `processing_runs` rows (path, latency, tokens, cost, credits);
- the Cook Mode check output;
- a real-output fixture in `tests/fixtures/live/`.

**How each observation will be labelled:**
- **Written reference:** compared with the creator's own text (description, caption or recipe page).
- **Manually verified:** you or another person watched the video and checked a specific claim. I can't watch
  videos, so these only appear when you provide them.
- **Unverified:** everything else, including all speech, on-screen and visual claims for F1 and F2.

## Limitations of this evaluation
- Small sample: 10 links, 4 creators, all in English or Hindi.
- Accuracy is only scored against written creator text.
  - Speech, on-screen and visual claims are not verified (rows 2, 3, and every `video_*` evidence label).
  - Row 1's step attribution to "video_visual" is not checked.
- Row 9 was forced by editing a database copy. It shows the transcript path, not a natural case.
- Row 5 is a made-up id; a real private, removed or age-restricted video may fail differently.
- One run per video. The spike's single repeat (soup) is the only consistency evidence.
- "Usable" is my reading of the output, not an observed cooking session.
- The creators' pages may have changed since the spike captured them (the turkey caption did between October
  and November).
