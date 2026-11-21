# Reelish test report

Ten real links, processed by the live pipeline on 2026-11-21. The full scoring notes are in
`docs/M4-EVALUATION.md`; this is the summary.

**Expected result** means what the creator's own published information supports (a description, a caption or
a linked recipe page). It's not a prediction written before the run. Where there is no written recipe, the
expected result is "no invented amounts", because we can't know the true amounts.

**Scores** compare against the creator's written text only. Rows marked "not verified" would need a person
to watch the video.

## Results

| # | Video | Expected | Actual | Ingredients | Amounts | Steps | Usable? | Time | Cost |
|---|---|---|---|---|---|---|---|---|---|
| 1 | [YT Short: creamy veg soup](https://www.youtube.com/shorts/VTR8vxBFGDY) (description + blog) | Complete | Complete | 13/13 | 11/11 | All but "bring to a boil" | Yes | 13.8 s | $0.0087 |
| 2 | [YT Short: Kaju Katli](https://www.youtube.com/shorts/s4na199iyag) (no written recipe) | Partial, no amounts | Partial; 5 ingredients "Not specified" | not verified | 0 invented | 8, not verified | No | 5.7 s | $0.0067 |
| 3 | [YT 5:13: Carluccio carbonara](https://www.youtube.com/watch?v=3AAdKl1UYZs) (recipe link dead) | Partial | Partial; 3 spoken amounts, 6 "Not specified" | not verified | 0 invented | 15, not verified | Partly | 17.8 s | $0.0169 |
| 4 | [YT music video](https://www.youtube.com/watch?v=dQw4w9WgXcQ) | Not a recipe | "This doesn't look like a recipe" | – | – | – | Correct | 4.5 s | $0.0067 |
| 5 | `youtube.com/watch?v=privateDemo` (made-up id) | Can't open | "We can't open this video", no AI call | – | – | – | Correct | 0.2 s | $0 |
| 6 | [IG Reel: crispy pasta salad](https://www.instagram.com/reel/DWZqrugEacU/) (caption recipe) | Complete | Complete, 3 ingredient groups | 12/12 | 12/12 | All | Yes | 13.3 s | $0.0065 + 1 credit |
| 7 | [IG Reel: soup](https://www.instagram.com/reel/DQZd7W8EbPx/) (caption links the recipe) | Complete | Complete | 13/13 | 11/11 | All | Yes | 12.4 s | $0.0067 + 1 credit |
| 8 | [IG Reel: turkey](https://www.instagram.com/reel/DPeUV0GjQnF/) (caption links the recipe) | Complete | Complete; wording issues | 11/11 | 11/11 | All 16 | Yes | 12.9 s | $0.0101 + 1 credit |
| 9 | Same Reel, recipe link blocked (transcript only) | Partial | Partial; no temperature or time, listed as gaps | 8 of the blog's 11 | 0 invented | 8 | No | 9.1 s | $0.0052 + 1 credit |
| 10 | `instagram.com/reel/DZq9xYwVbN0` (doesn't exist) | Can't open | "We can't open this video", no AI call | – | – | – | Correct | 4.3 s | $0 |

**Technical success:** 10/10. Every link was processed or refused correctly.
**Extraction:** on the four recipes with a written source, 49/49 ingredients and 45/45 amounts match. No
quantities were invented anywhere.
**Cooking usability (reviewer judgment, not observed):**
- 4 recipes cookable;
- 1 partly;
- 2 not cookable, which the app says up front.

## Cost
- **AI per recipe:** $0.0065–0.0169 (mean $0.0093). Instagram also used 1 Supadata credit per Reel.
- Refusals cost $0, except the music video ($0.0067): it takes an AI call to decide that a video isn't a recipe.
- Repeat requests are served from cache at $0.

## Failure cases and how they're handled

| Case | What the user sees | Cost |
|---|---|---|
| Not a YouTube or Instagram link, TikTok, channel page | Inline error before any job | $0 |
| Video doesn't exist or is private | "We can't open this video" | $0 (YouTube); a 404 wasn't billed by Supadata |
| Not a recipe | "This doesn't look like a recipe"; reused for 24 h | one AI call |
| Over 15 minutes | "Too long", before any AI call | $0 |
| Creator gave no amounts | Recipe with every amount "Not specified" and a banner saying so; the user can add their own | normal |
| Dead recipe link (`goo.gl`) or robots.txt says no | Skipped; falls back to the video and description | $0 |
| Budget or credit cap reached | "limited" message; cached recipes still work | $0 |
| Upstream error or timeout | Up to 2 automatic retries with backoff, then a clear failure and a retry button | paid stages cached |
| Worker restarted mid-job | Job resumes from cache after recovery | no double charge |

## UX checks on the real outputs (automated)

**First pass (M4):**
- All six stored real recipes, at 375×667, Pixel 7 and 1280×860, every Cook Mode step: no axe violations, no
  overflow, no console errors.
- But steps that reuse many ingredients pushed amounts below the buttons:
  - pasta salad step 6 showed 7 of 12 on a 375 px phone;
  - carbonara step 13 showed 4 of 5.
- Reading the real recipes turned up three wording problems: "1 5kg" turkey, "Done when get golden", and a
  basting interval shown as a cooking time.

**Fixes:** small explicit rules, no AI rewriting (details in `docs/M4-EVALUATION.md`).
- Cook Mode lists ingredients first used in the step or named in it, and collapses the rest under
  "Already added".
- Ambiguous amounts show the creator's own line.
- Cues that start with a bare verb get "Done when it …".
- Intervals show as repeats.

Regression tests run on the saved real model answers, not only synthetic data.

**Second pass, after the fixes:**
- Same recipes, at 375×667, 412×839, 768×1024, 1024×768 and 1280×800.
- **298/300 step views** show the instruction and every ingredient for the step without scrolling. The 2
  exceptions are 5-ingredient steps at 1024×768, where the fifth row sits just below the buttons.
- No axe violations (including with "Already added" open), no overflow, no console errors.

**Checks:** 245 unit and integration tests, and 23 e2e journeys with axe on phone and desktop (fixture data),
plus the production build.

## Not covered
- Videos over 6 minutes.
- A real minimal-speech video.
- Instagram from any creator other than @themodernnonna.
- Instagram's visual-notes path (mocked tests only).
- A real private or removed video.
- Repeat-run consistency through the current pipeline.
- Fresh runs F1–F4 (planned, waiting for approval; F4 needs a Reel link).
- **Any observed human cooking session.**

Proposed fresh runs and their cost are in `docs/M4-EVALUATION.md`.
