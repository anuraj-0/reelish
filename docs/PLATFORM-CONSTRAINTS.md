# Platform and permission constraints

What each external source allows, what we rely on, and what is still unresolved. Status as of 2026-11-21.
This is an engineering summary, not legal advice. Items marked **open** need a decision before a public launch.

## Instagram via Supadata: open (enabled publicly by owner decision, 2026-11-21)

> **Deployment decision (2026-11-21):** the owner chose to accept the risk below and run
> `INSTAGRAM_ENABLED=true` on the public site (<https://deepclean.app/reelish>). This is a **risk acceptance,
> not an authorization**: we still have no permission from Meta/Instagram or from the creators, and paying
> Supadata doesn't provide one. The permission question stays open. Switching it off takes one env change and a
> restart (`docs/DEPLOYMENT.md`).

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
  - **We have no permission from Instagram/Meta or from the creators** to process their Reels. Successful tests,
    a small audience or a "beta" label don't change that. Our tests show the integration *works*, not that it
    is *allowed*.
  - Turning Instagram on for public visitors is a risk the owner decides to accept (or not); it is not resolved
    by anything in this codebase. The owner accepted it for the deployment on 2026-11-21 (see the note above).
- **How we limit exposure:**
  - Public Reels only.
  - Creator text first; paid transcript or visual steps only when needed.
  - We keep the raw caption, transcript and visual notes only as a cache (24 h / 7 days). **But** the recipe
    derived from them is stored indefinitely, and its evidence quotes short caption lines. Caching doesn't make
    this permitted.
  - The recipe always credits the creator and links the original Reel.
  - Images aren't stored.

### Is there an authorized, link-based alternative? (checked 2026-11-22, Meta developer docs)

**No.** Nothing official turns an arbitrary Reel link into recipe text.

| Option | What it gives | Can we use it to make recipes? |
|---|---|---|
| **Instagram oEmbed** (`GET /instagram_oembed`; "Meta oEmbed Read"; no token needed since May 2026) | Embed HTML for a public post or Reel. The caption only appears inside that HTML. `author_name` and `thumbnail_url` were removed in November 2025 | **No.** The docs restrict it to "embedding Instagram content in websites and apps". Using the metadata or content "for any purpose other than providing a front-end view … is strictly prohibited", including "extracting, or persisting". **Display only.** |
| **Business Discovery** (Instagram Graph API) | Recent media of other *Business or Creator* accounts, including captions | **Not for our flow.** It needs our own Instagram professional account, Facebook Login and the `instagram_basic`, `instagram_manage_insights` and `pages_read_engagement` permissions. It is queried by username, not by Reel link, can't fetch a single item, and doesn't cover personal accounts. Processing the data is governed by the Platform Terms (§3.a.viii: only "permitted purposes set forth in Meta's Developer Docs"). Developer Policies §6.2 needs Meta's permission to "simply display User Content". Whether recipe extraction is a permitted purpose is **unverified**; it would need App Review |
| **Instagram API for our own account** | Our own media only | Not relevant |

Sources: [oEmbed](https://developers.facebook.com/docs/instagram-platform/oembed),
[oEmbed reference](https://developers.facebook.com/docs/graph-api/reference/instagram-oembed),
[changelog](https://developers.facebook.com/documentation/instagram-platform/changelog),
[Business Discovery](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-facebook-login/business-discovery),
[Platform Terms](https://developers.facebook.com/terms/), [Developer Policies](https://developers.facebook.com/devpolicy/).
Not read: the Instagram Terms of Use and the "Meta oEmbed Read" feature page.

### What we can responsibly make public
- **YouTube:** yes (official Data API, plus Gemini's YouTube-URL input; see below).
- **Instagram, as built (Supadata):** **not without an explicit owner decision to accept the risk.** That
  decision was made for the 2026-11-21 deployment, so Instagram is on. Without it, the setting would be
  `INSTAGRAM_ENABLED=false`, with only the built-in examples (fixtures) working.
- **Options that don't rely on scraping, and are not built:**
  1. The person pastes the Reel's caption text themselves, alongside the link. The text comes from the user;
     we credit and link the creator.
  2. The person pastes the creator's recipe-page link. We already read creator pages via JSON-LD, respecting
     robots.txt.
  3. Showing the Reel next to a recipe with the official embed (display only, nothing extracted).
  4. Creator opt-in or partnerships.

  1 and 2 are small, but they are new features, so they're listed for a decision rather than added.
- **Replaceability:**
  - All Supadata code lives in `lib/sources/instagram/supadata.ts`, behind the `InstagramProvider` interface
    (`lib/sources/instagram/types.ts`).
  - `INSTAGRAM_ENABLED=false` switches Instagram off; only the saved examples keep working.
- **Reliability:** free plan of 100 credits a month at 1 request per second. Our caps (defaults; production
  values in brackets):
  - `SUPADATA_DAILY_CREDITS` (25; production 10),
  - `SUPADATA_MONTHLY_CREDITS` (90, a rolling 30 days; production 60),
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
- Bot user agent: `ReelishBot/0.1; +https://deepclean.app/reelish` (contact URL added for launch).

## Display

- YouTube embeds and links with a timestamp are fine. Instagram thumbnails are signed CDN URLs that expire;
  we don't hotlink or store them.
