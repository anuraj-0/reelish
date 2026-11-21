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

### Extraction issues found in real outputs (not fixed: wording only, low risk)
- **Turkey "1 5kg"**: the blog says "1 5kg turkey (11 lbs)". The "(11 lbs)" that disambiguates it was dropped,
  so it can read as "15 kg". We keep creator text verbatim, so the fix would be to carry the parenthetical into
  the quantity, not to rewrite it.
- **Doneness cues with broken grammar**: "Done when get golden", "Done when reading of 180F…". The UI adds
  "Done when" in front of a phrase that doesn't always fit.
- **"every 40 minutes" (basting) is shown with the timer icon**, as if it were a cooking time.
- **Steps that list every ingredient**: pasta salad step 6 ("Toss in the crispy pasta and serve") shows all 12
  amounts again. On a 375 px phone, 5 of them sit below the controls (see the UX section of the test report).
- **One blog aside became a step** (soup Reel step 2: "no need to dice finely").

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

## Proposed fresh runs (needs approval; not run)

Candidates were checked for free with `npm run estimate` (YouTube Data API only, no AI call) on 2026-11-21. The
Instagram slots need links from you: checking a Reel costs a Supadata credit, so I haven't picked any.

| # | Fills gap | Link | What the free check showed | Expected result | Expected cost | Worst case |
|---|---|---|---|---|---|---|
| F1 | Long-form (13:28), new creator | [youtube.com/watch?v=i2AZRDIsMlc](https://www.youtube.com/watch?v=i2AZRDIsMlc) (Food52 with Joshua Weissman, cookie) | The recipe link `f52.co/3QAzlJq` returns 404; the description has chapters but no ingredient list | Partial: spoken amounts only, the rest "Not specified" | ~$0.030 | $0.0905 |
| F2 | Minimal speech / no on-screen recipe | [youtube.com/watch?v=UFmW_IaiLCM](https://www.youtube.com/watch?v=UFmW_IaiLCM) ("Cozy Home Cooking ASMR … No Talking", 5:17) | The description names vegetables and spices, no amounts | Partial with every amount "Not specified", or "doesn't look like a recipe". Either is acceptable; inventing amounts is not | ~$0.015 | $0.0455 |
| F3 | Over the length limit | [youtube.com/watch?v=kazwMSkeoSQ](https://www.youtube.com/watch?v=kazwMSkeoSQ) (2 h 22 m ASMR) | 8,537 s, over the 15-minute cap | "Too long", no AI call | $0 | $0 |
| F4 | Instagram, **different creator**, recipe in the caption | *your link* | – | Complete | ~$0.007 + 1 credit | $0.017 + 1 credit |
| F5 | Instagram, different creator, **music only, no recipe in the caption** (visual-notes path, never run live) | *your link* | – | Partial or "no recipe found" | ~$0.007 + 3–8 credits | $0.017 + 12 credits (per-job cap) |
| F6 | Run-to-run consistency | Row 2 (Kaju Short) again, on a database copy with its AI cache entry removed | – | Same ingredients and step order as row 2 | ~$0.007 | $0.025 |

- **Expected:** about $0.066 of OpenRouter and 4–9 Supadata credits.
- **Worst case:** $0.195 and 13 credits.
- Spend so far: about $0.086 of OpenRouter (spike + M2 + M3), and 24 of 100 Supadata credits this period.
- Expected spend stays well inside the $20 OpenRouter budget and the $0.20 development cap.
  - Worst case would pass the $0.20 cap, so the runs go one at a time, cheapest first, and **stop if the
    cumulative actual passes $0.18**.
  - The app's own caps still apply: $0.12 per call, $1 per 24 h, and 12 credits per job.
- **Ground truth for F1–F3 and F5 needs a person to watch the video.** None of them has a written recipe I can
  compare against.

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
