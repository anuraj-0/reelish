# Reelish: product and engineering notes

Reelish turns a YouTube or Instagram cooking video into a recipe you can cook from: an overview for
shopping and prep, and a Cook Mode that shows one step at a time with that step's amounts.

## The problem we actually solved
Cooking from a video means pausing, scrubbing back, and guessing amounts. The obvious approach, "ask an AI to
write the recipe", produces something that *looks* complete. That's worse than useless when the creator
never said how much cauliflower to use. So the core decision was: **never invent a quantity.** Every amount is
either confirmed from the creator, marked as suggested, or shown as *Not specified*, and the user can fill it
in. A recipe that admits it's missing amounts is more useful in the kitchen than one that quietly guesses.

## Key decisions
- **Use the creator's own text first.** Descriptions, captions and the creator's linked recipe page usually
  hold the real amounts, while the video itself often doesn't. On YouTube, Gemini watches the video *and*
  reads that text. On Instagram we read the caption and linked page, pay for a transcript only when they
  aren't enough, and pay for visual notes only when nobody speaks.
- **A deterministic guard after the model.**
  - An amount the model attributes to the description or linked recipe must actually appear there, on a line
    naming that ingredient. Otherwise it's downgraded.
  - Model "estimates" are dropped.
  - This is code, not a prompt. Prompts alone didn't hold: the model kept repeating missing amounts in
    `gaps` even when told not to.
- **Boring infrastructure.**
  - SQLite, a jobs table, and one worker process.
  - No queues, no Redis, no accounts. Edits and cooking progress live in the browser.
  - It runs on the VPS we already have.
- **Spend is reserved before it's spent.** Each paid call books its worst-case cost first, under a per-call
  cap and a 24-hour budget. Paid results are cached, so retries, crashes and normalizer changes don't pay
  twice.

## What we deliberately didn't build
- Accounts and sync.
- Unit conversion and serving scaling: they need reliable amounts, which half the videos don't have.
- Step timers.
- Adding new ingredients.
- TikTok.
- A cost dashboard (logs and an SQL query are enough at this size).
- A second model as a fallback provider.
- Downloading or storing videos: we never touch the video file.

## Failure handling
- **Bad links** are refused before any work.
- **Private or missing videos, non-recipes and over-long videos** get a plain message. Most cost nothing; a
  non-recipe costs one AI call.
- **Transient upstream errors** retry twice with backoff.
- **A worker crash** leaves the job to be picked up again, from cache.
- **When a budget cap is hit,** new jobs say so and cached recipes keep working.
- **Partial recipes are a normal outcome, not an error.** The page says up front what's missing.

## Cost
- About **$0.01 of AI per new recipe**. Measured: $0.0065–0.0169, mean $0.0093 over 6 recipes.
- Instagram adds 1 Supadata credit, or more if it needs a transcript or visual notes.
- A repeat visit costs nothing.
- Development so far: about $0.09 of the $20 OpenRouter budget.

## What we learned
- **The data decides usefulness, not the model.**
  - Every recipe with a written creator source came out right: 45/45 amounts.
  - Every video-only recipe invented no amounts but came out incomplete (and its steps are still unverified
    against the video).
  - The biggest lever is finding the creator's text, not a better prompt.
- **Instagram is the weak point, and not for technical reasons.** It works through Supadata, an unofficial
  scraping service. We have no permission from Meta or the creators, and testing doesn't change that. It's
  isolated behind a flag, and turning it on publicly is a separate decision.
- **Tests on localhost hid deployment bugs.** Running the production build with proxy headers found a redirect
  to `localhost` and a forgeable rate-limit key. All the e2e tests had passed.

## With another week
1. Run the cooking test with real people and fix what they trip on. Nobody has cooked from Reelish yet.
2. Widen the evaluation: longer videos, silent videos, more creators, repeat runs.
3. Cook Mode: show only the new ingredients on steps that combine earlier ones (today "toss and serve" repeats
   all 12 amounts).
4. Settle the Instagram permission question, or switch Instagram off for the public.
5. A cheap pre-check (title and description) so obvious non-recipes don't cost an AI call.
