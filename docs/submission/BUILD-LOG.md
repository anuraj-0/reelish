# Build log

## Tools
- **Claude Code** (Claude Opus 5.5) for planning, code, tests and docs. Every commit is co-authored.
- **App:**
  - Next.js 16 (App Router, Cache Components), React 19, Tailwind 4, shadcn/ui, Zod.
  - SQLite via Node's built-in `node:sqlite`.
  - `tsx` for the worker.
- **Tests:** Vitest (unit and integration, with mocked APIs), Playwright and axe-core (phone and desktop journeys).
- **External services:**
  - OpenRouter → `google/gemini-3.5-flash-lite` (pinned to Google AI Studio);
  - YouTube Data API;
  - Supadata (Instagram).
- **Feasibility spike:** Python scripts (`spike/`).

## Time
About **6½ hours on 21 November 2026**, from the first files (~17:30 IST) to the M3 docs (23:44). The commit
timestamps are the evidence. Work done outside the editor isn't counted.
*(Correct this if your own record differs.)*

| Phase | Commits | Roughly |
|---|---|---|
| Spike and plan | 18:24–18:35 | spike results, architecture, decisions |
| M0–M1: schema, UI on fixture data, e2e + axe, UX review | 18:44–20:10 | ~1½ h |
| M2: YouTube live, jobs, worker, caching, budget | 22:30–22:56 | (built from ~20:10) |
| M3: Instagram, credits, live fixes | 23:06–23:44 | ~1 h |
| M4: evaluation, production review, deployment plan, drafts | from 23:48 | in progress |

## Where AI helped
*(Both examples come from the commit history and the M3/M4 docs. Check that they match how you remember
the sessions before you submit.)*

**Finding an invisible bug in real captions (M3).**
- On the live Instagram runs, the soup Reel's "Comment 'recipe'" line never scored its recipe link, although
  the two looked adjacent.
- Claude found that the caption's "blank" lines were U+2800 Braille-blank characters, so they didn't count as
  empty. It added a fix and a test from the real caption.
- That would have been a slow one to find by eye, because the characters render as nothing.

## Where AI led us astray
**Code that passed every test but would have broken in production.**
- Claude wrote the no-JavaScript start form (`7d477e3`) with an absolute redirect built from `request.url`. It
  also wrote the rate limiter (`46b60f2`), which took the *first* `X-Forwarded-For` address.
- Both passed unit and e2e tests, because those run on `localhost` with no proxy.
- In M4 we ran the production build with Nginx-style headers. The form redirected visitors to
  `https://localhost:3200/…`, and the first `X-Forwarded-For` entry is whatever the visitor sends, so the
  per-visitor limit could be dodged.
- Both are fixed with tests (`d0d4ed6`, `f473083`).

**The lesson:** "all tests pass" said nothing about the environment the tests didn't model. The fix was to test
the deployed shape (built app, proxy headers), not to write more tests of the same kind.

A smaller one from M3:
- A link-scoring change let the line "his new book: http://…" inherit the "Recipe here:" context from the line
  above.
- The regression was caught and fixed in the same session: a line that holds its own link no longer gives
  context.
