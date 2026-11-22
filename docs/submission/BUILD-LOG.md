# Reelish: build log

## Tools used

| Area | Tools |
|---|---|
| AI coding assistant | Claude Code (Claude Opus 5.5): research, planning, code, tests and docs |
| App | Next.js 16, React 19, Tailwind 4, shadcn/ui, Zod, SQLite |
| AI model | Gemini 3.5 Flash Lite, called through OpenRouter |
| Video data | YouTube Data API (YouTube), Supadata (Instagram) |
| Testing | Vitest (unit and integration), Playwright and axe-core (browser and accessibility) |
| Hosting | A small existing VPS with systemd and Nginx |

## Time spent

About **8–10 hours** over 21–22 November 2026. This is an estimate, not timed: the Claude Code session
timestamps show about 7.5 hours of active work, plus some time outside the sessions.

## How the work was split

**What I did:** set the problem and the constraints, and made the product calls. I kept both platforms in
scope, chose the two-view design Claude recommended, and made the creator's text the core of the pipeline after
the first tests showed the video alone lacked amounts. I set the spending rules: each paid test needed my approval
first, under a $0.20 cap. I set the bar for evidence ("don't treat a syntax check as a successful test"). I kept the
plan to build the UI on saved recipes first, so the experience could be judged apart from extraction quality. Some
calls went against Claude's suggestions: a 15-minute video limit instead of 30, no cost dashboard, and Instagram
turned on publicly.

**What Claude Code did:** the competitor and feasibility research, the options and trade-offs, the architecture,
all of the code and tests, the debugging, and first drafts of these documents. I reviewed its results and sent
work back when it wasn't good enough.

**Checking its work:** Claude scored every recipe against the creator's written text and labelled what it
couldn't check as "not verified". I found one bug myself by using the live site: the home page got stuck on a loading
spinner. Claude traced it to pressing Back after opening a recipe, then fixed it and added a test (`af44fbb`).

## Where AI saved time

**Finding an invisible character in a real caption.**
One Instagram caption had a recipe link that the app kept ignoring. The text looked normal. Claude found that
the "blank" lines in the caption weren't really blank: they held an invisible Unicode character (U+2800), so
the app didn't treat them as empty lines. Claude fixed it and added a test based on the real caption. This
would have been very hard to spot by eye, because the character shows up as nothing.

## Where AI led us astray

**1. Code that passed every test but broke in production.**
- **What happened:** Claude wrote two pieces of code that worked in testing but not behind a real web server.
  The start form sent visitors to `https://localhost:3200/…` instead of the real site. The rate limiter could be
  bypassed, because it trusted an address that the visitor can fake.
- **Why the tests missed it:** all tests ran on `localhost` with no web server in front, so neither problem
  could appear.
- **How we caught it:** we ran the production build behind a simulated web server before deploying.
- **Fix:** both were fixed, with tests (commits `d0d4ed6` and `f473083`).
- **Lesson: automated tests only check the conditions they simulate.** Testing the app in its real setup found
  what more of the same tests could not.

**2. A wrong guess that cost three rebuilds.**
- **What happened:** on the live site, opening an unknown recipe link showed a server error instead of a "not
  found" page. Claude's first fix was based on a wrong reading of how Next.js works. It didn't help, and cost
  three rebuilds.
- **Fix:** we tested the request with and without each header the web server sends, and found the cause. The
  real fix was one line of web server config.

**3. A fix that caused a new bug.**
- **What happened:** a change to how recipe links are found let a link to a book ("his new book: http://…")
  look like the recipe link, because it came right after a "Recipe here:" line.
- **Fix:** caught and fixed in the same session. A line with its own link no longer borrows meaning from the
  line above it.
