# Spike results: YouTube Shorts via Gemini (OpenRouter -> Google AI Studio)

Run 2026-11-21. Model `google/gemini-3.5-flash-lite`, `processing: static`, `reasoning.effort: minimal`,
`max_tokens: 4000`. Raw responses: `*.raw.json`; parsed recipes: `*.recipe.json`; call log: `../ledger.jsonl`.

| Test | URL | Status | Latency | In tokens (video) | Out tokens | Billed | Worst case |
|---|---|---|---|---|---|---|---|
| T1 | youtube.com/shorts/VTR8vxBFGDY | 200 OK | 6.3 s | 2,723 (2,461) | 1,006 | $0.0033 | $0.0271 |
| T2 | youtube.com/shorts/s4na199iyag | 200 OK | 4.9 s | 8,542 (8,280) | 992 | $0.0050 | $0.0271 |

Total: $0.0084. Billed cost matches the OpenRouter price list exactly (input $0.30/M, output $2.50/M):
YouTube-URL input is billed, not free. Output is ~65–75% of cost. `audio_tokens` reported 0, but T1
contains spoken phrasing, so audio appears to be counted inside `video_tokens`.

## T1: Creamy vegetable soup Short, compared against the blog recipe

Note: the blog is a superset of the video. Anything only on the blog is not a model miss.

| Blog ingredient | Model | Verdict |
|---|---|---|
| 2 tbsp olive oil | not listed; "Cooking fat used for sautéing" in gaps | Correct to flag it, not invent it |
| 1 onion, 2 carrots, 2 celery ribs, 2 garlic cloves | listed, quantity `missing` | Names right; counts probably not in video (unverified) |
| salt, pepper (to taste) | listed, `missing` | OK |
| 5 cups cauliflower, 3 potatoes | listed, `missing` | Names right; quantities likely blog-only (unverified) |
| 4 cups chicken broth | **32 oz, `on_screen`** | Equals 4 cups; plausibly read off the carton. **Needs a human check** |
| 2 cups water | "a little bit of water", `missing` | OK, honest |
| chives + bacon bits (optional garnish) | not listed | Minor miss, possibly blog-only |

Steps: 6 model steps match the blog's order (sauté, season, add cauliflower and potatoes, broth and water,
semi-cover on medium-low ~30 min, blend). Missing: "bring to a boil" before lowering the heat, the
"until veggies are soft" doneness cue, and the garnish/serve step. "Semi-cover", "medium-low" and "about
30 minutes" match the blog, which suggests they came from speech.

Invented: no ingredients, quantities or instructions. One unflagged inference: `total_time: "35 minutes"`
(a few minutes plus 30) is presented as fact.

Cookable? Partly. Order and technique are right, but without vegetable amounts a cook would need to guess
proportions. That is a property of the video, not a model failure, and the gaps list says so.

## T2: "Kaju Takli Fuljhari" Short (hashtag-only title, no reference recipe)

- Title corrected to "Kaju Katli Phuljhari" (the real name of the sweet).
- 5 ingredients (cashews, water, sugar, cocoa powder, edible silver dust). **Every quantity `missing`**:
  no invented amounts.
- 8 ordered steps with plausible technique (cashew paste, sugar syrup "until sticky", dough, shape on
  skewers, roll in sugar, paint silver dust). Without a reference I can't confirm them.
  "Rinse cashews with hot water twice" is unusual and needs a human check.
- Gaps correctly name quantities, times/heat and servings.
- Cookable? No: there are no quantities, and the syrup consistency ("sticky") is vague. The model handled
  this correctly, by saying so instead of filling in amounts.

## Timestamps

They increase monotonically and fit the estimated lengths (~26 s and ~87 s at ~95 tokens/s), but I can't
watch the videos. Human spot-check links:

- T1 step 4 (broth, check "32 oz"): https://www.youtube.com/watch?v=VTR8vxBFGDY&t=13s
- T1 step 5 (medium-low, 30 min): https://www.youtube.com/watch?v=VTR8vxBFGDY&t=18s
- T2 step 1 (rinse cashews): https://www.youtube.com/watch?v=s4na199iyag&t=11s
- T2 step 5 (cocoa powder): https://www.youtube.com/watch?v=s4na199iyag&t=41s

## Not yet tested

Run-to-run consistency (same video twice), long videos (Y1), Instagram (Supadata), and whether adding the
YouTube description would fill the quantity gaps.

---

# Round 2: enrichment (C1, C2), timestamp verification, Instagram via Supadata

## OpenRouter runs (provenance prompt v2)

| Run | Inputs | Latency | In/out tokens | Billed |
|---|---|---|---|---|
| C1 `soup-v2-video` | YouTube Short only | 3.7 s | 2,880 / 1,372 | $0.0043 |
| C2 `soup-v2-video+recipe` | Short + creator's linked recipe (blog JSON-LD) | 6.3 s | 3,263 / 1,839 | $0.0056 |

Cumulative OpenRouter spend: $0.0182, matching OpenRouter's own key usage exactly.

- C1 reproduces T1: same 10 ingredients, broth "32 oz" (visual), the other quantities missing, 6 steps.
  Run-to-run difference: the broth timestamp was 00:13 in T1 and 00:16 in C1.
- C2: all 12 quantities and servings (3) filled in, **all matching the blog exactly**, each labelled
  `linked_recipe`. "32 oz" vs "4 cups" was reconciled and noted. Added the "until veggies are soft" cue
  and the serve/garnish step. No invented quantities. Still missing: "bring to a boil" and "medium-high"
  for the sauté (both on the blog). An empty `gaps` list is slightly overconfident.
- Provenance check: C2 tagged olive oil, chives and bacon as `video_visual`, which C1 did not. Supadata's
  visual pass on the same recipe's Reel confirms the bacon and chives garnish is shown on screen. Olive
  oil on the YouTube edit remains unverified.

## Timestamp verification (Supadata native YouTube captions, 1 credit)

The returned track was an auto-translated Arabic caption track (no `lang` sent); its meaning is clear.
The YouTube narration *does* say "low heat for about 30 minutes", "a little water" and "Kettle & Fire"
broth, so none of those were invented. All six speech-grounded timestamps from T1, C1 and C2 fall within
about ±1 s of the matching caption segment. The on-screen claim "32 oz" remains **unverified**.
The YouTube and Instagram edits of this recipe have **different narration**: only the Instagram one says
"touch of oil" and "bring to a boil".

## Instagram via Supadata (free plan)

| Reel | Metadata (caption) | Transcript | Extract (visual) | Credits | Latency |
|---|---|---|---|---|---|
| I1 soup `DQZd7W8EbPx` | OK. "Comment 'recipe'…" plus a **link to the blog recipe** | OK: steps, "touch of oil", no quantities | OK. On-screen text = burned-in captions; garnish (bacon, chives) visible; no quantities | 1+2+5 | 5.4 + 22.8 + 14.3 s |
| I2 pasta salad `DWZqrugEacU` | OK. **Full recipe in caption** | Empty (no speech), still charged | Not needed | 1+2 | 4.8 + 21.8 s |
| I3 turkey `DPeUV0GjQnF` | OK, but **caption empty** | OK: clear method, no quantities/temps/times | OK. On-screen text = captions; one orange; no quantities | 1+2+5 | 10.6 + 18.1 + 26.3 s |

Supadata credits used: 20 of 100 (including 1 for YouTube verification). No access errors; no video file
URLs returned (as documented).

Accuracy against the blog references:
- I2: the caption matches 12 of 13 blog ingredients with identical quantities. The blog adds 1 tsp olive
  oil to the dressing; the caption gives the vinegar as "½–1 tbsp" where the blog says ½ tbsp. Cookable.
- I1: Instagram-only content has every ingredient but no quantities. The caption's link to the creator's
  own recipe supplies all of them (same data as C2). Cookable *only with the linked recipe*.
- I3: Instagram-only content has the method but no quantities, oven temperature or times, and only
  "seasonings" (the blog lists paprika, salt, oregano, garlic powder). The blog is not linked from the
  Reel. **Not cookable**; the honest output is "not specified".
- Unsupported additions: none found in the Supadata outputs.

Not run (not approved): OpenRouter normalisation of the Instagram text into our recipe schema.
