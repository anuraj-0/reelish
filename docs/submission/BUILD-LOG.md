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
- **Deployment:** Next.js standalone output, esbuild (one-file worker bundle), systemd, Nginx, existing Let's
  Encrypt certificate, a small VPS shared with DeepClean.app.

## Time
**Estimate, not a measurement: about 6–8 hours in total.** Working time wasn't tracked with a timer.

How the estimate was made:
- The Claude Code transcripts for this project have message timestamps from 21 Nov 2026 17:33 IST to 22 Nov
  about 02:00 IST. Counting only stretches with no gap over 15 minutes gives **about 6.5 hours of active
  session time**:
  - 4.4 h spike through M3,
  - 0.7 h M4 review,
  - about 1.3 h deployment and final documents.
- That is session time, not the person's effort. Claude worked for long stretches inside single turns, and
  some time was spent outside the sessions (accounts and API keys, reading outputs, decisions). The 6–8 h range
  allows for that, but it's a judgment.

What the repository shows:
- 21 November 2026: commits run from 18:24 to 23:44 IST (milestones M0–M3), with a gap between about 20:10 and
  22:30 that has no commits.
- 21–22 November: further commits up to about 02:00 IST on 22 Nov: M4 evaluation and production review, the Cook
  Mode and wording fixes, then deployment and the final documents.

That's a range of commit times, not hours worked:
- It leaves out time before the first commit (spike, planning) and time between sessions.
- Much of the work was done by Claude Code in long-running turns, so the span doesn't reflect the person's own
  effort either.

## Where AI helped
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

A smaller one from the deployment day:
- Unknown recipe links returned 500 behind Nginx. Claude's first fix, a code workaround based on a misreading of
  Next.js internals, didn't work and cost three rebuilds.
- The real fix was one Nginx line: stop sending `X-Forwarded-Proto`, which Reelish never used. It was found by
  reproducing the request with and without each header.

Another from M3:
- A link-scoring change let the line "his new book: http://…" inherit the "Recipe here:" context from the line
  above.
- The regression was caught and fixed in the same session: a line that holds its own link no longer gives
  context.
