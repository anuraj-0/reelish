# Reelish: write-up

**Live app:** <https://deepclean.app/reelish>. Paste a cooking video; get a recipe to prep from and a step-by-step Cook Mode.

**The problem.** Recipe videos are easy to find and hard to cook from. A video plays in order, but cooking means
jumping around ("how much garlic?"). The recipe is also split up. In our first test, the soup
Short gave 1 of 12 amounts; the creator's linked recipe had all 12. **Who it's for:** home cooks making a dish they
found on YouTube or Instagram. That's an assumption; we didn't interview users.

## Key decisions and why

**1. One view to prepare, another to cook.** Prep needs the whole recipe; cooking needs this step and its
amounts. Claude compared a plain recipe page (weak mid-cook), a voice-and-timers companion (much more to build)
and a caption-only parser (useless when nothing is written). It recommended two views; I agreed, as Cook Mode
reuses the same data. *Cost:* each step must know its ingredients. One real step listed all 12 ingredients and pushed
amounts off a phone screen, so earlier ones now fold under "Already added".

**2. Never invent an amount.** Each amount is "From the creator", "Estimated" (e.g. read off a carton), "Not
provided" or "Added by you". Gaps look less complete, but a made-up "2 tbsp" is worse. The prompt isn't enough on
its own: in testing, the model stated a guessed total time as fact and ignored a prompt rule. So code checks
every amount the AI credits to the creator's text. If it isn't there, the label drops to "Estimated", and amounts
the AI guessed are removed. *Result:* 45/45 amounts matched on the 4 recipes with a written source. *Limit:* code
can't check what the AI says it heard in a YouTube video.

**3. Read the creator's text first,** since that's where the amounts usually are. YouTube: Gemini watches the
video with the description and linked recipe in the same call. Instagram: caption and linked recipe first; a
transcript only if a no-AI check says they aren't enough. Each live Reel cost 1 credit; running
every step had cost up to 8 and added no amounts. *Trade-off:* with no written recipe (3 of 7 test recipes), the
result stays partial and says so.

## What we chose not to build

**Accounts** (no sign-up; progress stays in the browser). **Voice and timers** (the companion we passed on). **Scaling
and unit conversion** (3 of 7 test recipes had few amounts to convert). **"Paste the caption" for Instagram:** I
ruled it out as the main path; copying the recipe yourself defeats the point. **A cost dashboard:** Claude planned
one; I cut it, as logs were enough. Also TikTok, video downloads, a backup AI provider.

## What can go wrong, and what Reelish does

| Problem | What Reelish does |
|---|---|
| Bad or private link; video over 15 min | A plain message, before any AI cost |
| Not a recipe, or no amounts anywhere | Says so; missing amounts show "Not provided" and can be added |
| A service fails, or the worker crashes | One retry, then a retry button. Crashed jobs resume without paying twice |
| Budget or rate limit reached | A "limited" message; saved recipes still work |

**Main open risk: Instagram permission.** Reels are read through Supadata, a scraping service. That it works
doesn't make it allowed: we have no permission from Meta or the creators. Claude advised keeping it off; I turned it on (capped, with an
off switch) because the brief asks for Reels. A wider launch needs a permitted route first.

**Cost per recipe:** about **$0.008 of AI** ($0.005–$0.017 over 10 runs), plus 1 Supadata credit per Reel. Bad
links and repeats cost $0. Total AI spend: $0.11 of $20.

## With another week

1. **Watch 5–8 people cook with it.** Do they finish? When do they go back to the video? Are failures wrong
   recipes or confusing screens? That decides whether extraction, Cook Mode or the idea itself comes next.
2. **Move Instagram to a permitted route** (user-pasted captions, creator opt-in or Meta approval).
3. **Test what we skipped** (a 13-minute video, more silent videos, Reels from other creators), and add a free
   title check so obvious non-recipes cost nothing.
