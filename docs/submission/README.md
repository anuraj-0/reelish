# Reelish

Reelish turns a YouTube or Instagram cooking video into a recipe you can cook from. Videos are a hard way to
follow a recipe: they play in order while cooking jumps around, and the amounts are often scattered across the
video, its caption and a linked blog.

## Try it

- **Live app:** <https://deepclean.app/reelish> (YouTube videos and Shorts, public Instagram Reels; no sign-up)
- **Code, with full commit history:** <https://github.com/anuraj-0/reelish>

## What I built

Paste a link. Reelish reads the creator's caption, description or linked recipe, uses the video where that isn't
enough, and builds one recipe. Every amount shows where it came from. The recipe page is for shopping and prep.
Cook Mode shows one step at a time with only that step's ingredients, keeps the screen on, and remembers your
place. I directed the work and made the product calls. Claude Code did the research and wrote the code, tests
and first drafts. The build log has the details.

## Three key decisions

1. **Separate views for preparing and cooking.** They're different tasks: prep needs the whole recipe, cooking
   needs the current step.
2. **Never invent an amount.** Missing amounts say "Not provided". Code checks every amount the AI credits to the
   creator's text, because the prompt alone wasn't trustworthy enough.
3. **Read the creator's text first.** In the first test, the soup video alone gave 1 of 12 amounts; the creator's
   linked recipe gave all 12. On Instagram this also avoids paying for transcripts.

## What testing showed

- **11 of 11 test links** were processed or correctly refused (recipes, a non-recipe, a too-long video, bad links).
- **On the 4 recipes with a written creator recipe:** 49/49 ingredients and 45/45 amounts matched, with none
  unsupported. This is a small sample of the easiest case, not a general accuracy rate.
- **About $0.008 of AI per new recipe.** Total AI spend for the whole project: $0.11 of the $20 budget.
- **Live site:** 42/42 browser checks passed. A worker killed mid-job recovered without paying twice.

## What's still unproven

- **Whether it helps people cook.** Nobody has cooked with Reelish yet. That's the first thing I'd test.
- **Harder videos:** nothing over 6 minutes, one unscored silent Reel, and scored Reels from one creator only.
- **Instagram permission:** Reels are read through a third-party scraper, without permission from Meta or the
  creators. It's on for this assignment by my decision. A wider launch needs a permitted route first.

## Submission materials

| File | What's in it |
|---|---|
| **Reelish - Write-up.pdf** | **Start here.** One page: the problem, key decisions, what we didn't build, failures, cost, next week |
| **Reelish - Test report.pdf** | Every test link with expected and actual results; what was and wasn't measured; how we'd measure success |
| **Reelish - Build log.pdf** | Tools, time, how the work was split, and where AI helped or led us astray |
| **screenshots/** | The live app on desktop and on a phone |
| **AI session logs/** | *Optional supporting evidence:* the Claude Code sessions, as readable PDFs |

**Reading the AI session logs.** Three sessions, in order: (1) scoping, feasibility tests and building M0–M3;
(2) M4 evaluation and release prep; (3) UI and UX improvements. **User** is me and **Claude** is Claude Code. A
**Subagent report** is the answer from a helper agent Claude started; full transcripts are in `subagents/`. Each grey
line is one action Claude took. Tool output and Claude's private reasoning are left out. `raw/` holds the complete
original transcripts.
