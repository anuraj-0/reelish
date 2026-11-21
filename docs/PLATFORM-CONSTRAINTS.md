# Platform and permission constraints

What each external source allows, what we rely on, and what is still unresolved. Status as of 2026-11-21.
This is an engineering summary, not legal advice. Items marked **open** need a decision before a public launch.

## Instagram via Supadata: open

- **What we use:**
  - Supadata's `metadata` endpoint (caption, author, duration), its `transcript` endpoint, and, rarely, its
    `extract` endpoint.
  - We never receive or store the video file. Instagram's own API offers no access to other creators' Reels
    for this purpose.
- **Risk:**
  - Supadata is unofficial and scraping-based, and its terms make the customer "solely responsible" for
    complying with platform terms.
  - Instagram's terms prohibit unauthorised automated collection.
  - *Meta v. Bright Data* (2024) favoured logged-out scraping of public data, but that's one lower-court ruling.
    **Acceptable for an MVP or beta only as a documented risk.**
- **How we limit exposure:**
  - Public Reels only.
  - Creator text first; paid transcript or visual steps only when needed.
  - We keep the caption, transcript and visual notes only as a cache (24 h / 7 days).
  - The recipe always credits the creator and links the original Reel.
  - Images aren't stored.
- **Replaceability:**
  - All Supadata code lives in `lib/sources/instagram/supadata.ts`, behind the `InstagramProvider` interface
    (`lib/sources/instagram/types.ts`).
  - `INSTAGRAM_ENABLED=false` switches Instagram off; only the saved examples keep working.
- **Reliability:** free plan of 100 credits a month at 1 request per second. Our caps:
  - `SUPADATA_DAILY_CREDITS` (25),
  - `SUPADATA_MONTHLY_CREDITS` (90, a rolling 30 days),
  - `SUPADATA_MAX_JOB_CREDITS` (12).

  Whether failed calls are billed isn't documented; we count them at worst case. Observed: a 404 lookup was
  not billed.

## YouTube

- **Gemini YouTube-URL input (via OpenRouter, Google AI Studio only):** a preview feature; pricing and limits
  may change. Only public videos work.
- **YouTube Data API (`videos.list`):** official; 1 quota unit per call out of 10,000 a day.
  - The API Services Terms and Developer Policies (attribution, storage and refresh limits) must be read before
    launch.
  - We cache video details for 6 h and show the creator and a link back. **Open:** confirm the storage limits
    for the saved recipes.

## Creators' recipe pages

- We fetch at most 2 linked pages per video, respect robots.txt (an unreachable robots.txt counts as "not
  allowed"), and read only the page's schema.org Recipe (JSON-LD).
- Ingredient lists are largely factual, but the method text is the creator's expression. We show a normalized
  recipe with clear credit and a prominent link to the original, and never republish whole pages. **Open:**
  confirm this is acceptable for a public launch.
- Bot user agent: `ReelishBot/0.1`. **Open:** add a contact URL before launch.

## Display

- YouTube embeds and links with a timestamp are fine. Instagram thumbnails are signed CDN URLs that expire;
  we don't hotlink or store them.
