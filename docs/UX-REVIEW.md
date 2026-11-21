# UX review: M1 preview (2026-11-21)

**Method.** I inspected rendered screenshots (headless Chromium) at five sizes:

| Size | Viewport |
|---|---|
| iPhone SE | 375×667 |
| Pixel 7 | 412×915 |
| iPad portrait | 820×1180 |
| iPad landscape | 1180×820 |
| Desktop | 1440×900 |

I used the four saved recipes, including the incomplete turkey and the silent kaju katli. The
automated checks (axe, Playwright) ran alongside, but every finding below comes from looking at the
screens.

Before/after screenshots: `docs/screenshots/m1-before-review/` and `docs/screenshots/m1-after-review/`.

## Five most important problems

| # | Problem | Why it matters | Kind | Status |
|---|---|---|---|---|
| 1 | **Cook Mode on small phones hid the step's amounts.** On a 375×667 screen only 1 of 5 ingredient rows was visible above Back/Next; the instruction was oversized and the detail chips stacked. | Mid-cook, the amount is what you glance at. Scrolling with messy hands is the problem Reelish exists to solve. | Genuine usability | **Fixed.** Text scales with the screen, chips share one row, rows are compact, the header is tighter. Now all 5 rows are visible on 375×667 (an e2e test requires at least 4). |
| 2 | **No way to see other steps in Cook Mode.** Only Back/Next. | Cooks look ahead ("do I need the oven soon?") and jump back. Paging one step at a time is slow and loses your place. | Genuine usability | **Fixed.** A visible "Steps" button opens a sheet with every step; the current one is highlighted; tap to jump. |
| 3 | **Desktop and tablet are a stretched phone layout.** One ~630 px column with large empty margins, a thumbnail that fills the first screen, ingredients and steps never visible together, and the same narrow Cook Mode on a big screen. | On a laptop or tablet propped on the counter you want ingredients and method side by side, and the step readable from across the kitchen. | Genuine (usefulness); the specific layout is a design choice | **Not changed yet.** Options below. |
| 4 | **The overview's first screen didn't answer "am I ready?"** The thumbnail took about 40% of a small phone screen; there were no counts and no positive "all amounts given". | You should know in about two seconds how big the job is and whether anything's missing. | Mostly genuine; image size is partly taste | **Fixed.** 2:1 thumbnail on phones, ingredient and step counts in the facts row, and a green "All amounts given…" line (or the existing amber banner). |
| 5 | **Amounts written inside instructions could contradict edits.** The saved recipes keep amounts out of step text, but live AI output may write "add 2 cups broth". If you then edit the broth, the step disagrees with the list. | Silent inconsistency is worse than a missing amount, because it's trusted. | Genuine correctness risk | **Guarded.** `quantitiesInStepText()` detects it; a test keeps all saved recipes clean; M2's normalizer must keep it empty (rewrite or flag). |

### Smaller findings
- **Fixed:**
  - The Cook Mode header truncated the title ("Creamy V…") and wrapped "Step 1 of 7". On phones the title is now hidden (it's on the overview) and the wake indicator is icon-only with a screen-reader label.
  - The readiness line said "all amounts given" while the optional garnish had none. It now says "except optional extras".
- **Fine as is:** missing information reads as *information*, not breakage. The amber banner is calm, the dashed "+ Not specified" pill invites action, and the editor explains the creator didn't say. Refresh keeps checked items, edits and the Cook Mode step (now e2e-tested on the cook page itself).
- **Subjective, left alone:** the serif headings, the warm palette, and Cook Mode's sans-serif step text (chosen for legibility at a distance). The landing page's five-example list is long, but it's preview scaffolding and goes away once live links work.
- **Dev only:** the round "N" badge bottom-left is the Next.js dev indicator. It doesn't appear in production builds.
- **Not verifiable here:** iOS Safari (no WebKit installed, given the disk), the soft keyboard covering the editor's Save button on real phones, and wake-lock behaviour on real devices.

## Desktop and tablet layout: options (decision needed)

All three keep the phone layout unchanged below ~1024 px. Tablet portrait (820 px) stays single
column but uses its width better: bigger type, and Cook Mode ingredients in two columns.

**A. Two-column workspace (recommended)**
```
Overview ≥1024px                                   Cook Mode ≥1024px
┌──────────────────────┬─────────────────────────┐ ┌───────────────────────────────┬───────────────┐
│ [thumb]  Title       │ Steps                   │ │ Step 3 of 7  ▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬ │ All steps     │
│ Serves 3 · 40 min    │ 1 Heat the oil…  ▶0:06  │ │                               │ 1 Heat oil  ✓ │
│ ✓ All amounts given  │ 2 Season…        ▶0:09  │ │  Pour in the broth and water, │ 2 Season    ✓ │
│ ── Ingredients ──    │ 3 Add cauliflower…      │ │  just enough to cover the…    │ 3 Pour in   ● │
│ ☐ Olive oil  2 tbsp  │ …                       │ │  [Done when it boils]         │ 4 Lower heat  │
│ ☐ Onion          1   │ Where this comes from   │ │  For this step                │ …             │
│ (sticky while you    │                         │ │  Broth 4 cups · Water 2 cups  │ ▶ Watch step  │
│  scroll the steps)   │ [ Start cooking ]       │ │  [ ← Back ]   [ Next → ]      │               │
└──────────────────────┴─────────────────────────┘ └───────────────────────────────┴───────────────┘
```
- **Pros:** ingredients and method visible together; Cook Mode uses the screen for a very large
  instruction plus a permanent step list (no sheet needed); feels purpose-built.
- **Cons:** the most work (two layouts to test); a sticky column needs care with long lists.
- **Effort:** about half a day including tests and screenshots.

**B. Wider single column with an ingredients side rail (overview only)**
- **What changes:** at ≥1024 px the ingredient list moves to a sticky right rail. Cook Mode is only
  widened, with bigger text.
- **Pros:** smaller change; fixes the "can't see both" problem on the overview.
- **Cons:** Cook Mode still feels like a stretched phone screen.
- **Effort:** about 2 hours.

**C. Keep the layout; only scale type and spacing up on large screens**
- **Pros:** smallest risk.
- **Cons:** doesn't fix what you flagged ("stretched mobile layout").
- **Effort:** under an hour.

Recommendation: **A**, built mobile-first so phones are untouched, with the tablet-portrait
refinements included.
