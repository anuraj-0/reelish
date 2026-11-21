# Reelish test report

Ten links processed by the live pipeline during development on 2026-11-21 (#1–10), one over-length video
(#11, F3), and a production smoke test on the deployed site (<https://deepclean.app/reelish>).
- **Real videos:** 8 distinct ones. Seven were processed (#1, 2, 3, 4, 6, 7, 8); #11 is a real video that was
  refused for length.
- **Variants and error cases:** #9 reruns #8 with its recipe link blocked. #5 and #10 are deliberately made-up
  ids, used to test the "can't open" path.
- Times are IST unless marked UTC. The full
scoring notes for #1–10 are in `docs/M4-EVALUATION.md`; this is the summary.

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
| 11 | [YT 2:22:17 stream](https://www.youtube.com/watch?v=kazwMSkeoSQ) (F3, 8,537 s) | Refused as too long, no AI call | "This video is too long"; metadata failed, later stages never ran | – | – | – | Correct | 0.25 s | $0 |

**Technical success:** 11/11. Every link was processed or refused correctly.
- #11 ran on 2026-11-22 (IST) against the release build with `OPENROUTER_BASE_URL` pointed at a dead local port, so
  an AI call was impossible even by mistake. The database recorded one run at $0.00.
- The other planned fresh runs (F1 Food52 13-minute video, F2 no-talking ASMR video, F4 a Reel from another
  creator) were **not run**, by decision, to ship.
**Extraction:** on the four recipes with a written source, 49/49 ingredients and 45/45 amounts match. No
quantities were invented anywhere.
**Cooking usability (reviewer judgment, not observed):**
- 4 recipes cookable;
- 1 partly;
- 2 not cookable, which the app says up front.

## Cost
- **AI per recipe:**
  - The 6 first-pass recipes (#1–3, 6–8) cost $0.0065–0.0169, mean $0.0093.
  - Adding the blocked-link variant #9 ($0.0052): 7 development recipe runs, $0.0052–0.0169, mean $0.0087.
  - Adding the 3 live-site recipes below: 10 runs, mean $0.0084.
  - Instagram also used 1 Supadata credit per Reel.
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

**Checks (re-run 2026-11-22 before deploying):** lint, typecheck, 245 unit and integration tests, 23 e2e
journeys with axe on phone and desktop (fixture data, 1 phone-only test skipped on desktop), and the production
build.

## Production smoke test (deployed site, 2026-11-22 01:10–01:22 IST)

Run against `https://deepclean.app/reelish` (release `4d6083c`), not localhost. The browser checks were
re-run at about 01:55 IST on the current release `af44fbb` (a start-form fix): 42/42 passed, cached videos only, $0.

**Browser checks:** `node scripts/smoke-prod.mjs` (Chromium, desktop 1280×860 and Pixel 7). **42/42 passed**
on the final run:
- landing over HTTPS, no axe violations, no horizontal overflow;
- TikTok link refused inline;
- paste → progress (4 stages) → overview → Cook Mode → finish;
- ingredient check-off and Cook Mode step survive a reload;
- a recipe with no amounts shows each one as "Not specified"; a user amount persists after reload, and removing
  it restores "Not specified";
- unknown recipe → 404 page;
- no console errors.

The first runs failed on the script's own selectors (live recipe ids carry a version suffix; the live soup says
"Chicken or veggie broth"), not on the app. Screenshots are in `docs/screenshots/production/`.

**Jobs on the live server** (times from the jobs table, costs from `processing_runs`):

| Link | Result | Time | AI cost | Supadata |
|---|---|---|---|---|
| YT soup `VTR8vxBFGDY` | Recipe: 13 ingredients, 11 with amounts (chives and bacon bits "Not specified", as in #1), 8 steps | 13.2 s | $0.0094 | – |
| YT Kaju Katli `s4na199iyag` | Partial: 5 ingredients, all "Not specified" (as in #2), 9 steps | 6.7 s | $0.0077 | – |
| IG pasta salad `DWZqrugEacU` | Recipe from the caption, status complete (not re-scored against #6) | 7.6 s | $0.0059 | 1 credit |
| YT music video `dQw4w9WgXcQ` | "Doesn't look like a recipe" (after a forced worker kill, below) | 40.9 s | $0.0018 | – |
| `watch?v=privateDemo` | "We can't open this video" | 0.3 s | $0 | – |
| YT carbonara `3AAdKl1UYZs` | "Limited": budget cap deliberately set to $0.001 for this test | 4.2 s | $0 | – |
| Same soup link again | Returned the existing recipe id at once, no job | 0.2 s | $0 | – |

**Infrastructure checks:**
- **Worker crash:** `SIGKILL` 3 s into the music-video job. systemd restarted the worker 3 s later. After the
  30 s heartbeat timeout the job was requeued (`jobs_recovered`) and finished on attempt 2. A graceful restart
  (SIGTERM) during the Instagram job let the job finish first.
- **Web and worker restart:** all three recipes still returned 200 afterwards.
- **Rate limits:** Nginx returned 429 when job starts came faster than its 6/min edge limit. The app returned
  `rate_limited` on the 7th new video from one visitor within an hour. Cached recipes aren't limited.
- **Spending:** the $0.001 budget test stopped before any AI call; the cap was restored to $0.50.
- **Health:** `reelish-health.timer` (5 min) and `reelish-backup.timer` (daily) active; a backup was written.
- **DeepClean.app** and the other app on that host returned 200 before and after every Nginx change. All other services stayed
  active. Reelish used ~55 MB (web) + ~24 MB (worker).

**Cost reconciliation:** the OpenRouter key's usage went from $0.0858 to $0.1106 (**+$0.0248**). The
`processing_runs` ledger sums to exactly $0.0248. So the AI call cut off by `SIGKILL` (left as "reserved") was
not billed. Supadata went from 24 to 25 credits (+1).

## Not covered
- Videos over 6 minutes that we'd process (F1 not run; only the over-length refusal, #11).
- A real minimal-speech video (F2 not run).
- Instagram from any creator other than @themodernnonna (F4 not run).
- Instagram's visual-notes path (mocked tests only).
- A real private or removed video.
- Repeat-run consistency through the current pipeline. The production soup and Kaju Katli runs matched #1 and
  #2 at the level checked above (ingredient count and which amounts are missing), but their steps weren't
  re-scored.
- **Any observed human cooking session.** The observation sheet is in `docs/USABILITY-TEST.md`.

The proposed fresh runs and their cost are in `docs/M4-EVALUATION.md`.
