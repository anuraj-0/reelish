import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseJsonContent } from "@/lib/llm/openrouter";
import { meaningfulCaption, renderTranscript } from "@/lib/pipeline/instagram";
import { normalizeRecipe } from "@/lib/pipeline/normalize";
import { LlmRecipe } from "@/lib/pipeline/prompt";
import { quantitiesInStepText } from "@/lib/recipe/consistency";
import { applyEdits, EMPTY_EDITS } from "@/lib/recipe/edits";
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
