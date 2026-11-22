# Reelish: write-up

**Live:** <https://deepclean.app/reelish>. A YouTube or Instagram link becomes a recipe overview plus a Cook
Mode: one step at a time, with that step's amounts.

**The problem:** with a video you scrub back with messy hands, amounts are said once or never, and the written
recipe hides behind a link. An AI that "writes the recipe" looks complete even when the creator never said how
much, which is worse than an honest gap.

## Key decisions and why
- **Never invent a quantity.** Every amount is marked "From the creator", "Estimated" or "Not provided".
  The cook can add their own amount and still see the creator's original.
- **Creator text first.** Descriptions, captions and linked recipe pages hold the real amounts far more often
  than the video. On YouTube, Gemini watches the video and reads that text. On Instagram we pay for a
  transcript only when the caption and linked page aren't enough.
- **Code checks the model.** An amount credited to the creator's text must appear there, on a line naming that
  ingredient, or it's downgraded. Prompting alone didn't hold.
- **Small tested rules, not another AI pass,** for wording fixes and for showing only the ingredients the
  current step needs.
- **Boring infrastructure:** SQLite, one worker, an existing VPS; progress stays in the browser.
- **Spend is booked before it's spent.** Every AI call reserves its worst case under a per-call cap and a
  daily budget. Results are cached, so retries and crashes don't pay twice.

## What we chose not to build
Accounts; serving scaling and unit conversion (half the videos give no reliable amounts); timers; TikTok; video
downloads; a fallback AI provider; a cost dashboard; a "paste the caption" mode for Instagram.

## What can go wrong, and what Reelish does
- **Bad link, private/missing video, over 15 minutes:** a plain message, no AI cost.
- **Not a recipe:** said plainly after one AI call. **No amounts given:** all shown "Not provided", with a
  banner.
- **Upstream error:** two retries, then a clear failure and a retry button.
- **Worker crash mid-job:** the job resumes from cache after 30 s. Tested on the live server with a forced kill;
  nothing was billed twice.
- **Budget, credit or rate limit hit:** a "limited" message; saved recipes keep working.
- **Instagram permission (the open risk):** it works through Supadata, an unofficial scraping service. We have
  no permission from Meta or the creators, and paying a provider doesn't create one. It's on because the owner
  accepted that risk; one setting turns it off.

## Cost per recipe
**About $0.01 of AI per new recipe:** $0.0052–0.0169 over 10 recipe runs (7 in development, 3 live).
Instagram adds 1 Supadata credit. A non-recipe costs $0.002–0.007. Bad or too-long links and repeat visits
cost $0. Total so far: $0.11 of the $20 budget.

## With another week
1. Watch real people cook from it. Nobody has yet.
2. Run the harder videos we skipped: a 13-minute video, a no-talking video, other creators' Reels.
3. Replace Instagram scraping with something allowed: "paste the caption", or creator opt-in.
4. A free title-and-description pre-check, so obvious non-recipes cost nothing.
