# Reelish: test report

## Summary

Each question below is answered separately. Passing one doesn't imply the next.

| Question | Result | Based on |
|---|---|---|
| **1. Does the pipeline work?** Processing and refusals | **11 of 11 links** were processed, or refused with the right message: 7 recipes, 1 non-recipe, 1 too-long video, 2 made-up links | Real AI and video services, 21–22 Nov |
| **2. Is the recipe right?** Compared with the creator's written recipe | **4 recipes** have one: **49/49 ingredients and 45/45 amounts** match, 0 unsupported. The other 3 can't be scored: their amounts are "Not provided", except 3 spoken carbonara amounts nobody has checked | Line-by-line comparison |
| **3. Could you cook from it?** Our judgment | 4 yes, 1 partly, 2 no. The 2 "no" recipes say up front what's missing | Reading the recipe in the app. **Not** a cooking test |
| **4. Do the screens work?** Automated checks | 298 of 300 Cook Mode step views fit without scrolling (5 screen sizes); no accessibility errors; **42/42** checks on the live site | Playwright and axe |
| **5. Does it help people cook?** | **Not tested.** Nobody has cooked with Reelish yet | Plan at the end |

**Reading these numbers:**
- 49/49 and 45/45 come from 4 recipes, 3 of them from one creator, all with a written recipe to work from. That
  is the easiest case. It shows Reelish keeps the creator's amounts intact. It is not a general accuracy rate.
- 11 of 11 is about handling links correctly, not about recipe quality.
- The browser checks show the screens work. They don't show that cooking is easier.

## What was tested

- **11 links** run through the real pipeline (real AI and real video services) on 21–22 November 2026:
  - 8 real videos (7 processed, plus 1 refused for being too long);
  - 1 rerun of a real video with its recipe link blocked (#9);
  - 2 made-up links, to test the "can't open" path (#5 and #10).
- **A smoke test of the live site** at <https://deepclean.app/reelish>.
- **Automated tests:** unit, integration, browser and accessibility tests.

**How to read the results:**
- **Expected** is what the creator's own written information supports (description, caption or linked recipe
  page). If there is no written recipe, the expected result is "no invented amounts", because the true amounts
  are unknown.
- **Scores** compare the app's output with the creator's written text. Nobody watched the videos to check
  spoken or on-screen details.
- Label names were changed after testing. This report uses the current names.
- Full scoring notes are in `docs/M4-EVALUATION.md` in the repository.

## Results

| # | Video | Expected | Actual | Ingredients | Amounts | Steps | Cookable? | Time | AI cost |
|---|---|---|---|---|---|---|---|---|---|
| 1 | [YouTube Short: creamy veg soup](https://www.youtube.com/shorts/VTR8vxBFGDY) (description + blog) | Complete | Complete | 13/13 | 11/11 | All but 1 | Yes | 13.8&nbsp;s | $0.0087 |
| 2 | [YouTube Short: Kaju Katli](https://www.youtube.com/shorts/s4na199iyag) (no written recipe) | Partial | Partial | Unverified | None given, 0 invented | 8, unverified | No | 5.7&nbsp;s | $0.0067 |
| 3 | [YouTube, 5 min: carbonara](https://www.youtube.com/watch?v=3AAdKl1UYZs) (recipe link dead) | Partial | Partial | Unverified | 3 of 9, unverified | 15, unverified | Partly | 17.8&nbsp;s | $0.0169 |
| 4 | [YouTube music video](https://www.youtube.com/watch?v=dQw4w9WgXcQ) | Not a recipe | Not a recipe | – | – | – | Correct | 4.5&nbsp;s | $0.0067 |
| 5 | `youtube.com/watch?v=privateDemo` (made-up) | Can't open | Can't open | – | – | – | Correct | 0.2&nbsp;s | $0 |
| 6 | [Instagram Reel: crispy pasta salad](https://www.instagram.com/reel/DWZqrugEacU/) (recipe in caption) | Complete | Complete | 12/12 | 12/12 | All | Yes | 13.3&nbsp;s | $0.0065 |
| 7 | [Instagram Reel: soup](https://www.instagram.com/reel/DQZd7W8EbPx/) (caption links the recipe) | Complete | Complete | 13/13 | 11/11 | All | Yes | 12.4&nbsp;s | $0.0067 |
| 8 | [Instagram Reel: turkey](https://www.instagram.com/reel/DPeUV0GjQnF/) (caption links the recipe) | Complete | Complete* | 11/11 | 11/11 | All 16 | Yes | 12.9&nbsp;s | $0.0101 |
| 9 | Same Reel as #8, recipe link blocked (transcript only) | Partial | Partial | 8 of 11 | None given, 0 invented | 8 | No | 9.1&nbsp;s | $0.0052 |
| 10 | `instagram.com/reel/DZq9xYwVbN0` (doesn't exist) | Can't open | Can't open | – | – | – | Correct | 4.3&nbsp;s | $0 |
| 11 | [YouTube, 2 h 22 min stream](https://www.youtube.com/watch?v=kazwMSkeoSQ) | Too long | Too long | – | – | – | Correct | 0.25&nbsp;s | $0 |

Rows 6–9 also used 1 Supadata credit each. Refusals (#5, #10, #11) made no AI call. "Unverified" means a person
would need to watch the video to check it. *Turkey wording fixed later (see below). "Cookable?" is our reading of
the recipe, not an observed cooking session.

## Cost

- **AI cost per recipe:** $0.0052–$0.0169, about $0.0084 on average across 10 recipe runs (7 above, 3 on the
  live site).
- **Instagram:** also 1 Supadata credit per Reel.
- **Refusals cost $0**, except "not a recipe", which needs one AI call to decide ($0.0067 for #4).
- **Repeat requests** come from the cache and cost $0.

## How failures are handled

| Case | What the user sees | Cost |
|---|---|---|
| Not a YouTube or Instagram link (e.g. TikTok, a channel page) | An error message before anything runs | $0 |
| Video doesn't exist or is private | "We couldn't access this video" | $0 |
| Not a recipe | "This doesn't look like a recipe" | One AI call |
| Over 15 minutes | "This video is too long", before any AI call | $0 |
| Creator gave no amounts | The recipe, with every amount "Not provided", a notice, and the option to add your own | Normal |
| Recipe link dead or blocked | Skipped; the app uses the video and description instead | $0 |
| Budget or credit limit reached | A "limited" message; saved recipes still work | $0 |
| Outside service error or timeout | One automatic retry, then a clear error and a retry button | Finished steps are cached |
| Worker restarts mid-job | The job picks up where it left off | Nothing charged twice |

## Usability checks on real recipes (automated)

**First pass found three kinds of problem:**
- **Amounts hidden on small screens:** in steps with many ingredients, some amounts were pushed below the
  buttons. For example, the pasta salad's step 6 showed only 7 of 12 ingredients on a small phone.
- **Wording:** "1 5kg" turkey, "Done when get golden", and a basting interval shown as a cooking time.
- No accessibility errors, layout overflow or console errors.

**Fixes (simple rules, no extra AI):**
- Cook Mode lists the ingredients used in the current step, and folds the rest under "Already added".
- Unclear amounts also show the creator's original line.
- Wording rules fix cues like "Done when get golden" and show intervals as repeats.
- Tests were added using the real AI output, not just made-up data.

**Second pass, after the fixes:** on 5 screen sizes from small phone to desktop, **298 of 300 step views** show
the step and all its ingredients without scrolling. The 2 exceptions are 5-ingredient steps on a 1024×768
screen, where the last ingredient sits just below the buttons. No accessibility errors, overflow or console
errors.

**Full automated test suite (before release `12ff1e1`):** lint, type check, 249 unit and integration
tests, 29 browser journeys with accessibility checks on phone and desktop (1 phone-only test skipped on desktop),
and the production build. All passed.

## Live site test

**Browser test:** a script ran 42 checks on the live site, on desktop and on a phone-sized screen. **42/42
passed.** It was re-run after each later release, using cached videos only ($0), and passed each time. It
covers:
- the home page loads over HTTPS with no accessibility errors;
- a TikTok link is refused;
- the full journey: paste a link, see progress, view the recipe, cook step by step, finish;
- ticked ingredients and the current Cook Mode step survive a page reload;
- a recipe with no amounts shows "Not provided", and an amount the user adds is saved;
- an unknown recipe link shows a "not found" page;
- no console errors.

**Real jobs on the live site:**

| Link | Result | Time | AI cost |
|---|---|---|---|
| YouTube soup (same as #1) | 13 ingredients, 11 with amounts (as in #1), 8 steps | 13.2&nbsp;s | $0.0094 |
| YouTube Kaju Katli (same as #2) | 5 ingredients, all "Not provided" (as in #2), 9 steps | 6.7&nbsp;s | $0.0077 |
| Instagram pasta salad (same as #6) | Recipe from the caption (not re-scored); also 1 Supadata credit | 7.6&nbsp;s | $0.0059 |
| YouTube music video (same as #4) | "This doesn't look like a recipe", after a forced worker crash (see below) | 40.9&nbsp;s | $0.0018 |
| Made-up link (same as #5) | "We couldn't access this video" | 0.3&nbsp;s | $0 |
| YouTube carbonara (same as #3) | "Limited", because the budget was set to $0.001 on purpose for this test | 4.2 s | $0 |
| The soup link again | The saved recipe, straight away | 0.2&nbsp;s | $0 |
| [Instagram Reel: paneer butter masala](https://www.instagram.com/reel/CjwyMyHJtcu/) (music only, @home_cookingvideos; tried by me after launch) | First try failed: "can't open this video" (bug, below). After the fix: partial, 11 ingredients and 8 steps read from on-screen text, every amount "Not provided" (not scored); also 7 Supadata credits | 46.1&nbsp;s | $0.0055 |

**Reliability checks on the live server:**
- **Worker crash:** we force-killed the worker during a job. It restarted 3 seconds later, and the job finished
  on its second try.
- **Restarts:** after restarting the app and the worker, all recipes still loaded.
- **Rate limits:** too many requests from one visitor were blocked, as designed. Saved recipes are never
  limited.
- **Budget cap:** with the budget set to $0.001, the job stopped before any AI call. The cap was then reset.
- **Other apps on the same server** kept working throughout.
- **Silent Reels (found after launch):** I tried two music-only Reels and both failed. Supadata answers "no audio
  track" for a video without sound, and the app treated that as "can't open this video". The other hit our daily
  credit limit before reading the on-screen text, and was then wrongly cached as "not a recipe". Both fixed in
  `e901a38`, with tests, and the daily limit raised from 10 to 25 credits. The paneer Reel above is the re-run.
- **Billing matched:** OpenRouter's usage went up by exactly the amount the app recorded ($0.0248). The AI call
  cut off by the crash was not charged.

## Not tested

- Processing a video longer than 6 minutes (only the "too long" refusal was tested).
- A video with little or no talking: only the one music-only Reel above, unscored.
- Instagram Reels from creators other than @themodernnonna: only that same Reel.
- (The last three were planned as paid runs. I skipped them to ship on time.)
- Instagram's fallback that reads text from the video frames (tested with mock data only).
- A real private or deleted video.
- Whether the same video gives the same steps every time (on the live reruns, ingredient counts and missing
  amounts matched; steps weren't re-scored).
- **Real people cooking with the app.** See the plan below.

## What would show Reelish works (not measured yet)

**The question that matters:** when someone opens a recipe in Reelish, do they go on to cook the dish? We'd count
that as a successful cooking session. We can't measure it today. The app has no usage tracking and no accounts, and
only the cook can say whether the dish worked.

| | What | Status |
|---|---|---|
| **Measured now** | Whether each link is processed or refused; amounts matched against the creator's text; unsupported amounts; AI cost and time per recipe; whether each Cook Mode step fits on screen | In this report |
| **Could be logged, not built** | Share of pasted links that become a recipe; share of recipes where Cook Mode is opened; share where the last step is reached; amounts people add, and which label they replaced; taps on "Watch this step" (a sign the recipe wasn't enough) | The jobs table holds the first. Edits and Cook Mode progress stay in the browser, so the server can't see them |
| **Needs people** | Did they finish? Did the dish turn out as expected? Where did they get stuck? Was it easier than cooking from the video? | The study below |

Reaching the last step is only a proxy. People can finish cooking without tapping through, or tap through
without cooking.

**Proposed study (not run).** The script and observation sheet are in `docs/USABILITY-TEST.md`.
- 5–8 people who cook at least now and then and haven't seen Reelish.
- Each cooks a recipe they'd actually make, on their own phone, ideally in their own kitchen. They use their own
  video if Reelish can read it, otherwise the soup or pasta salad from this report.
- We note where they get stuck, every amount they change, every time they go back to the video, and whether they
  finish.
- We ask how they usually cook from videos. With 5–8 people, this is a comparison of experiences, not a
  measurement.
- We tag each problem as **extraction** (the recipe was wrong or missing something) or **experience** (the recipe
  was right but hard to use).

**What the results would mean.** There are no pass marks. With this few people, the pattern matters more than a
percentage.
- **Most finish and rarely go back to the video:** keep going. Next come more creators and harder videos.
- **Most problems are extraction:** improve extraction first, including what Reelish shows when the creator wrote
  nothing down.
- **The recipes are right, but people get lost or go back to the video:** improve Cook Mode first.
- **People prefer the video even when the recipe is right:** rethink the idea. A lighter tool, such as just the
  ingredient list, might be enough.

## Next technical steps, in order

1. **Move Instagram to a permitted route:** captions the user pastes, creator opt-in, or approval from Meta. This
   blocks any wider launch.
2. **Run the skipped hard cases:** a 13-minute video, more videos with no talking, and Reels from other creators.
   Until then, these results mostly describe short, clearly narrated videos from one creator.
3. **Add a free title-and-description check** so obvious non-recipes cost $0 instead of $0.002–$0.007. The saving is
   small, so it comes last.

