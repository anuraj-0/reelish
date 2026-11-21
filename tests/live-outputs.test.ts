import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseJsonContent } from "@/lib/llm/openrouter";
import { meaningfulCaption, renderTranscript } from "@/lib/pipeline/instagram";
import { normalizeRecipe } from "@/lib/pipeline/normalize";
import { LlmRecipe } from "@/lib/pipeline/prompt";
import { quantitiesInStepText } from "@/lib/recipe/consistency";
import { splitStepIngredients } from "@/lib/recipe/cook";
import { doneCueText } from "@/lib/recipe/cues";
import { applyEdits, EMPTY_EDITS, type ViewRecipe } from "@/lib/recipe/edits";
import { isRepeatInterval } from "@/lib/recipe/time";
import { quantityLabel } from "@/lib/recipe/labels";
import { renderLinkedRecipe, type LinkedRecipe } from "@/lib/sources/linked-recipe";

/** Real Gemini answers from the M2 live tests, normalised offline: no network, no cost. */
type Fixture = {
  video: { videoId: string; title: string; channelTitle: string; durationSec: number; thumbnailUrl: string | null };
  description: string | null;
  linkedRecipe: LinkedRecipe | null;
  modelContent: string;
};

function run(name: string) {
  const f = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures/live", `${name}.json`), "utf8")) as Fixture;
  const llm = LlmRecipe.parse(parseJsonContent(f.modelContent));
  return normalizeRecipe(llm, {
    recipeId: `yt-${f.video.videoId}-test`,
    pipelineVersion: "yt-1",
    createdAt: "2026-11-21T17:05:45.000Z",
    stages: ["metadata", "linked_recipe", "video", "normalize"],
    video: { ...f.video, url: `https://www.youtube.com/watch?v=${f.video.videoId}` },
    description: f.description,
    linked: f.linkedRecipe ? { url: f.linkedRecipe.url, text: renderLinkedRecipe(f.linkedRecipe) } : null,
  });
}

describe("real model outputs", () => {
  it("soup Short + description + linked recipe: complete, every required amount confirmed", () => {
    const { recipe, warnings } = run("soup");
    expect(recipe.extraction.status).toBe("complete");
    const required = recipe.ingredients.filter((i) => !i.optional);
    expect(required.length).toBeGreaterThanOrEqual(10);
    expect(required.every((i) => quantityLabel(i) === "confirmed")).toBe(true);
    expect(recipe.ingredients.find((i) => /broth/i.test(i.name))?.quantity?.raw).toBe("4 cups");
    expect(recipe.steps.every((s) => s.videoTimestampSec === null || s.videoTimestampSec <= 27)).toBe(true);
    expect(recipe.source.linkedRecipeUrls).toEqual(["https://themodernnonna.com/creamy-vegetable-soup/"]);
    expect(quantitiesInStepText(recipe)).toEqual([]);
    expect(warnings).toEqual([]);
  });

  it("kaju katli Short with no written recipe: honest partial, nothing invented", () => {
    const { recipe } = run("kaju");
    expect(recipe.extraction.status).toBe("partial");
    expect(recipe.ingredients.every((i) => i.quantityStatus === "missing")).toBe(true);
    expect(recipe.steps.length).toBeGreaterThanOrEqual(6);
    // "Cashews · blended into a paste" must not appear on the "wash the cashews" step.
    const view = applyEdits(recipe, EMPTY_EDITS);
    const cashews = (i: number) => view.steps[i].ingredients.find((x) => x.name === "Cashews");
    expect(cashews(0)?.preparation).toBeNull();
    const after = view.steps.findIndex((s, i) => i > 1 && s.ingredients.some((x) => x.name === "Cashews"));
    if (after !== -1) expect(cashews(after)?.preparation).toMatch(/paste/);
  });

  it("carbonara long-form, recipe link dead: spoken amounts kept, the rest missing", () => {
    const { recipe } = run("carbonara");
    expect(recipe.extraction.status).toBe("partial");
    expect(recipe.ingredients.find((i) => i.name === "Salt")?.quantity?.raw).toMatch(/10 grams/);
    expect(recipe.ingredients.find((i) => i.name === "Eggs")).toMatchObject({ quantityStatus: "stated", quantity: { amount: 2 } });
    expect(recipe.steps.every((s) => s.videoTimestampSec === null || s.videoTimestampSec <= 313)).toBe(true);
    expect(recipe.gaps.some((g) => /quantit/i.test(g))).toBe(false);
  });

  it("music video: not a recipe", () => {
    expect(() => run("not-recipe")).toThrow(/no recipe/);
  });
});

/** Real Instagram runs (M3): Supadata details/transcript + Gemini answer, normalised offline. */
type IgFixture = {
  details: { shortcode: string; caption: string; creatorName: string | null; creatorHandle: string | null; durationSec: number | null };
  linkedRecipe: LinkedRecipe | null;
  transcript: { lang: string | null; segments: { startSec: number; text: string }[] } | null;
  modelContent: string;
};

function runIg(name: string) {
  const f = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures/live", `${name}.json`), "utf8")) as IgFixture;
  const llm = LlmRecipe.parse(parseJsonContent(f.modelContent));
  const caption = meaningfulCaption(f.details.caption);
  return normalizeRecipe(llm, {
    recipeId: `ig-${f.details.shortcode}-test`,
    pipelineVersion: "ig-1",
    createdAt: "2026-11-21T17:40:00.000Z",
    stages: ["caption", "linked_recipe", "normalize"],
    platform: "instagram",
    video: { videoId: f.details.shortcode, url: `https://www.instagram.com/reel/${f.details.shortcode}/`, title: null, channelTitle: f.details.creatorName ?? "", creatorHandle: f.details.creatorHandle, durationSec: Math.ceil(f.details.durationSec ?? 900), thumbnailUrl: null },
    description: null,
    caption,
    linked: f.linkedRecipe ? { url: f.linkedRecipe.url, text: renderLinkedRecipe(f.linkedRecipe) } : null,
    transcript: f.transcript?.segments.length ? renderTranscript(f.transcript.segments) : null,
    visual: null,
    videoWatched: false,
  });
}

describe("real Instagram outputs", () => {
  it("pasta salad (caption only): complete, every amount confirmed from the caption", () => {
    const { recipe, warnings } = runIg("ig-pasta");
    expect(recipe.extraction.status).toBe("complete");
    expect(recipe.ingredients).toHaveLength(12);
    expect(recipe.ingredients.every((i) => quantityLabel(i) === "confirmed" && i.evidence[0].source === "caption")).toBe(true);
    expect(recipe.ingredients.find((i) => /vinegar/i.test(i.name))?.quantity?.raw).toBe("1/2-1 tbsp");
    expect(new Set(recipe.ingredients.map((i) => i.group))).toEqual(new Set(["Crispy pasta", "Yogurt dressing", "The veg"]));
    expect(warnings).toEqual([]);
  });

  it("soup (caption links the blog): complete from the linked recipe", () => {
    const { recipe } = runIg("ig-soup");
    expect(recipe.extraction.status).toBe("complete");
    expect(recipe.source.linkedRecipeUrls).toEqual(["https://themodernnonna.com/creamy-vegetable-soup/"]);
    expect(recipe.ingredients.filter((i) => !i.optional).every((i) => quantityLabel(i) === "confirmed")).toBe(true);
  });

  it("turkey without its recipe link (transcript): honest partial with transcript timestamps", () => {
    const { recipe } = runIg("ig-turkey-transcript");
    expect(recipe.extraction.status).toBe("partial");
    expect(recipe.ingredients.every((i) => i.quantityStatus === "missing")).toBe(true);
    expect(recipe.steps.every((s) => s.evidence.some((e) => e.source === "video_speech"))).toBe(true);
    const ts = recipe.steps.map((s) => s.videoTimestampSec);
    expect(ts.every((t) => t !== null && t <= 41)).toBe(true);
  });
});

/** Cook Mode and wording rules, checked on the real extracted recipes (not synthetic fixtures). */
describe("cooking rules on real outputs", () => {
  const views: Record<string, ViewRecipe> = {
    soup: applyEdits(run("soup").recipe, EMPTY_EDITS),
    kaju: applyEdits(run("kaju").recipe, EMPTY_EDITS),
    carbonara: applyEdits(run("carbonara").recipe, EMPTY_EDITS),
    pasta: applyEdits(runIg("ig-pasta").recipe, EMPTY_EDITS),
    "ig-soup": applyEdits(runIg("ig-soup").recipe, EMPTY_EDITS),
    turkey: applyEdits(runIg("ig-turkey").recipe, EMPTY_EDITS),
    "turkey-transcript": applyEdits(runIg("ig-turkey-transcript").recipe, EMPTY_EDITS),
  };
  const names = (xs: { name: string }[]) => xs.map((x) => x.name);
  const stepWith = (v: ViewRecipe, re: RegExp) => v.steps.findIndex((s) => re.test(s.text));

  it("turkey: '1 5kg' isn't parsed as a number, and the creator's line is shown as written", () => {
    const turkey = views.turkey.ingredients.find((i) => i.name === "Turkey")!;
    expect(turkey.quantity).toEqual({ raw: "1 5kg", amount: null, amountMax: null, unit: null });
    expect(turkey.creatorWording).toBe("1 5kg turkey (11 lbs)");
    // Clear amounts get no note.
    expect(views.turkey.ingredients.filter((i) => i.creatorWording !== null).map((i) => i.name)).toEqual(["Turkey"]);
    expect(Object.values(views).flatMap((v) => v.ingredients.filter((i) => i.creatorWording !== null)).length).toBe(1);
  });

  it("turkey: 'baste every 40 minutes' is a repeat with no minutes, not a cooking time", () => {
    const bake = views.turkey.steps[stepWith(views.turkey, /basting every 40/)];
    expect(bake.duration).toEqual({ raw: "every 40 minutes", minMinutes: null, maxMinutes: null });
    expect(isRepeatInterval(bake.duration!.raw)).toBe(true);
    // Real durations elsewhere are untouched.
    const all = Object.values(views).flatMap((v) => v.steps.map((s) => s.duration).filter((d) => d !== null));
    expect(all.filter((d) => isRepeatInterval(d!.raw)).map((d) => d!.raw)).toEqual(["every 40 minutes"]);
  });

  it("every real done-when cue reads as a sentence", () => {
    const cues = Object.values(views).flatMap((v) => v.steps.flatMap((s) => (s.doneCue ? [doneCueText(s.doneCue)] : [])));
    expect(cues).toContain("Done when it gets golden");
    expect(cues).toContain("Done when it comes to room temp");
    expect(cues.find((c) => /180F/.test(c))).toMatch(/^Done at a reading of 180F/);
    // No bare verb after "Done when".
    for (const c of cues) expect(c, c).not.toMatch(/^Done when (get|come|turn|become|reach|start|begin)\b/i);
  });

  it("Cook Mode never drops an ingredient, and always shows ones first used in the step", () => {
    for (const [name, v] of Object.entries(views)) {
      v.steps.forEach((step, i) => {
        const { now, earlier } = splitStepIngredients(v.steps, i);
        expect([...now, ...earlier].map((x) => x.id).sort(), `${name} step ${i + 1}`).toEqual(step.ingredients.map((x) => x.id).sort());
        const before = new Set(v.steps.slice(0, i).flatMap((s) => s.ingredientIds));
        for (const ing of step.ingredients) if (!before.has(ing.id)) expect(names(now), `${name} step ${i + 1}`).toContain(ing.name);
      });
    }
  });

  it("pasta salad: 'toss in the crispy pasta' shows the pasta, not all 12 amounts again", () => {
    const toss = splitStepIngredients(views.pasta.steps, stepWith(views.pasta, /^Toss in the crispy pasta/));
    expect(names(toss.now)).toEqual(["Pasta shells"]);
    expect(toss.earlier).toHaveLength(11);
    // Assembling: the vegetables are new; the dressing was measured in the step before.
    const assemble = splitStepIngredients(views.pasta.steps, stepWith(views.pasta, /^Add the diced romaine/));
    expect(names(assemble.now)).toEqual(["Romaine", "English cucumber", "Cherry tomatoes", "Kalamata olives", "Pepperoncini"]);
    expect(names(assemble.earlier)).toEqual(["Plain yogurt", "Honey Dijon mustard", "White balsamic vinegar", "Salt"]);
  });

  it("reused ingredients stay visible when the step needs them again", () => {
    const k = views.kaju;
    expect(names(splitStepIngredients(k.steps, stepWith(k, /^Roll the shaped pieces in sugar/)).now)).toEqual(["Sugar"]);
    const c = views.carbonara;
    expect(names(splitStepIngredients(c.steps, stepWith(c, /^Garnish with grated parmesan and pepper/)).now)).toEqual(["Parmesan", "Pepper"]);
    const pour = splitStepIngredients(c.steps, stepWith(c, /^Pour the egg and cheese sauce/));
    expect(names(pour.now)).toEqual(["Eggs", "Egg yolk"]);
    const t = views.turkey;
    expect(names(splitStepIngredients(t.steps, stepWith(t, /^Massage the turkey/)).now)).toEqual(["Turkey", "Unsalted butter"]);
  });
});
