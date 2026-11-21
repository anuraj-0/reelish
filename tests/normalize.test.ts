import { describe, expect, it } from "vitest";
import { PipelineError } from "@/lib/pipeline/errors";
import { normalizeRecipe, quantityAppearsIn, type NormalizeInput } from "@/lib/pipeline/normalize";
import { LlmRecipe } from "@/lib/pipeline/prompt";
import { quantitiesInStepText, stripQuantities } from "@/lib/recipe/consistency";
import { quantityLabel } from "@/lib/recipe/labels";
import { Recipe } from "@/lib/recipe/schema";
import { SOUP_DESCRIPTION } from "./fixtures/youtube";
import { LINKED_TEXT, soupLlm, soupLlmRaw } from "./fixtures/llm";

const input = (over: Partial<NormalizeInput> = {}): NormalizeInput => ({
  recipeId: "yt-VTR8vxBFGDY-abc123",
  pipelineVersion: "yt-1",
  createdAt: "2026-11-21T12:00:00.000Z",
  stages: ["metadata", "linked_recipe", "video", "normalize"],
  video: { videoId: "VTR8vxBFGDY", url: "https://www.youtube.com/watch?v=VTR8vxBFGDY", title: "Soup Short", channelTitle: "The Modern Nonna", durationSec: 27, thumbnailUrl: "https://i.ytimg.com/vi/VTR8vxBFGDY/hqdefault.jpg" },
  description: SOUP_DESCRIPTION,
  linked: { url: "https://themodernnonna.com/creamy-vegetable-soup/", text: LINKED_TEXT },
  ...over,
});

const byName = (r: Recipe, name: string) => r.ingredients.find((i) => i.name === name)!;

describe("normalizeRecipe", () => {
  it("produces a valid recipe with verified creator amounts", () => {
    const { recipe, warnings } = normalizeRecipe(soupLlm(), input());
    expect(Recipe.safeParse(recipe).success).toBe(true);
    expect(recipe.extraction.status).toBe("complete");
    const oil = byName(recipe, "Olive oil");
    expect(oil.quantity).toEqual({ raw: "2 tablespoons", amount: 2, amountMax: null, unit: "tablespoons" });
    expect(quantityLabel(oil)).toBe("confirmed");
    expect(oil.evidence[0]).toMatchObject({ source: "description", excerpt: "2 tablespoons olive oil" });
    // Found by numbers on the cauliflower line even without a quote.
    expect(byName(recipe, "Cauliflower").quantityStatus).toBe("stated");
    expect(byName(recipe, "Salt").quantity?.raw).toBe("to taste");
    expect(byName(recipe, "Chicken or veggie broth").evidence[0]).toMatchObject({ source: "linked_recipe", url: "https://themodernnonna.com/creamy-vegetable-soup/" });
    expect(warnings).toEqual([]);
  });

  it("keeps step details and maps ids, heat, cues and timestamps", () => {
    const { recipe } = normalizeRecipe(soupLlm(), input());
    expect(recipe.steps[0]).toMatchObject({ id: "s1", heat: "medium-high", videoTimestampSec: 6, ingredientIds: ["olive-oil", "yellow-onion"] });
    expect(recipe.steps[0].evidence.find((e) => e.source === "video_speech")?.videoTimestampSec).toBe(6);
    expect(recipe.steps[0].evidence.find((e) => e.source === "linked_recipe")?.excerpt).toContain("medium high heat");
    expect(recipe.steps[2]).toMatchObject({ duration: { raw: "25 to 30 minutes", minMinutes: 25, maxMinutes: 30 }, doneCue: "the veggies are soft" });
    expect(recipe.servings).toMatchObject({ raw: "3", value: 3 });
    expect(recipe.totalTime).toMatchObject({ raw: "40 minutes", minutes: 40 });
    expect(recipe.conflicts[0].path).toBe("ingredients.chicken-or-veggie-broth.quantity");
    expect(recipe.source.linkedRecipeUrls).toEqual(["https://themodernnonna.com/creamy-vegetable-soup/"]);
  });

  it("downgrades an amount the cited text doesn't contain", () => {
    const llm = soupLlm();
    llm.ingredients[0].quantity = "3 tablespoons";
    llm.ingredients[0].quantity_quote = "3 tablespoons olive oil";
    const { recipe, warnings } = normalizeRecipe(llm, input());
    const oil = byName(recipe, "Olive oil");
    expect(oil.quantityStatus).toBe("suggested");
    expect(quantityLabel(oil)).toBe("suggested");
    expect(warnings.join()).toMatch(/not found in description/);
  });

  it("re-attributes an amount found in the other text source", () => {
    const llm = soupLlm();
    llm.ingredients[4].quantity_source = "description"; // "4 cups" is in both; the linked quote says "chicken broth"
    llm.ingredients[4].quantity_quote = null;
    const { recipe } = normalizeRecipe(llm, input({ description: "Just a soup video." }));
    expect(byName(recipe, "Chicken or veggie broth").evidence[0].source).toBe("linked_recipe");
  });

  it("removes evidence for sources we never provided", () => {
    const { recipe, warnings } = normalizeRecipe(soupLlm(), input({ linked: null }));
    const broth = byName(recipe, "Chicken or veggie broth");
    // Claimed from the linked recipe, which wasn't fetched; but the description has "4 cups … broth".
    expect(broth.evidence.some((e) => e.source === "linked_recipe")).toBe(false);
    expect(broth.evidence[0].source).toBe("description");
    expect(recipe.servings).toBeNull();
    expect(warnings.join()).toMatch(/removed unavailable source/);
  });

  it("drops amounts the model estimated: missing stays missing", () => {
    const llm = soupLlm();
    llm.ingredients[5].quantity = "2 tablespoons";
    llm.ingredients[5].quantity_source = "model_estimate";
    const { recipe } = normalizeRecipe(llm, input());
    expect(byName(recipe, "Chives")).toMatchObject({ quantity: null, quantityStatus: "missing" });
  });

  it("labels amounts read off packaging as suggested", () => {
    const llm = soupLlm();
    llm.ingredients[4].quantity = "32 oz";
    llm.ingredients[4].quantity_source = "video_visual";
    const broth = byName(normalizeRecipe(llm, input()).recipe, "Chicken or veggie broth");
    expect(broth.quantityStatus).toBe("suggested");
    expect(quantityLabel(broth)).toBe("suggested");
  });

  it("strips amounts out of step text so edits stay consistent", () => {
    const llm = soupLlm();
    llm.steps[2].text = "Pour in 4 cups of broth and 2 cups water, then simmer.";
    const { recipe, warnings } = normalizeRecipe(llm, input());
    expect(recipe.steps[2].text).toBe("Pour in broth and water, then simmer.");
    expect(quantitiesInStepText(recipe)).toEqual([]);
    expect(warnings.join()).toMatch(/removed amounts from step 3/);
  });

  it("drops unknown ingredient references and impossible timestamps", () => {
    const llm = soupLlm();
    llm.steps[0].ingredient_ids.push("ghost");
    llm.steps[1].video_timestamp = "5:00"; // video is 27 s
    llm.steps[3].sources = ["linked_recipe"];
    llm.steps[3].video_timestamp = "0:21"; // not attributed to the video
    const { recipe } = normalizeRecipe(llm, input());
    expect(recipe.steps[0].ingredientIds).toEqual(["olive-oil", "yellow-onion"]);
    expect(recipe.steps[1].videoTimestampSec).toBeNull();
    expect(recipe.steps[3].videoTimestampSec).toBeNull();
  });

  it("marks a recipe partial when required amounts are missing", () => {
    const llm = soupLlm();
    for (const i of llm.ingredients) {
      i.quantity = null;
      i.quantity_source = null;
    }
    const { recipe } = normalizeRecipe(llm, input({ description: "#shorts", linked: null }));
    expect(recipe.extraction.status).toBe("partial");
    expect(recipe.ingredients.every((i) => i.quantityStatus === "missing")).toBe(true);
  });

  it("drops invented servings and tips", () => {
    const llm = soupLlm();
    llm.servings = { text: "4", sources: ["model_estimate"] };
    llm.notes = [{ text: "Freezes well.", sources: ["model_estimate"] }];
    const { recipe } = normalizeRecipe(llm, input());
    expect(recipe.servings).toBeNull();
    expect(recipe.notes).toEqual([]);
  });

  it("gives duplicate ingredient names unique ids", () => {
    const llm = soupLlm();
    llm.ingredients.push({ ...llm.ingredients[0], id: "oil-2" });
    llm.steps[0].ingredient_ids.push("oil-2");
    const { recipe } = normalizeRecipe(llm, input());
    expect(recipe.ingredients.map((i) => i.id)).toContain("olive-oil-2");
    expect(recipe.steps[0].ingredientIds).toContain("olive-oil-2");
  });

  it("drops gaps that only repeat missing amounts, and capitalises names", () => {
    const llm = soupLlm();
    llm.ingredients[0].name = "olive oil";
    llm.gaps = ["Exact quantity of spaghetti", "Quantities for cashews are not specified.", "No oven temperature given"];
    const { recipe } = normalizeRecipe(llm, input());
    expect(recipe.gaps).toEqual(["No oven temperature given"]);
    expect(recipe.ingredients[0].name).toBe("Olive oil");
  });

  it("rejects non-recipes", () => {
    const llm = LlmRecipe.parse({ ...soupLlmRaw, is_recipe: false, ingredients: [], steps: [] });
    expect(() => normalizeRecipe(llm, input())).toThrow(PipelineError);
  });
});

describe("LlmRecipe tolerance", () => {
  it("drops bad values instead of failing the whole answer", () => {
    const raw = structuredClone(soupLlmRaw) as Record<string, unknown>;
    (raw.steps as Record<string, unknown>[])[0].heat = "very hot";
    (raw.ingredients as Record<string, unknown>[])[0].sources = ["description", "a blog"];
    (raw.ingredients as Record<string, unknown>[])[0].optional = "no";
    delete (raw as { notes?: unknown }).notes;
    const parsed = LlmRecipe.parse(raw);
    expect(parsed.steps[0].heat).toBeNull();
    expect(parsed.ingredients[0].sources).toEqual(["description"]);
    expect(parsed.ingredients[0].optional).toBe(false);
    expect(parsed.notes).toEqual([]);
  });

  it("still fails when the structure is wrong", () => {
    expect(LlmRecipe.safeParse({ is_recipe: true, ingredients: "none" }).success).toBe(false);
  });
});

describe("quantityAppearsIn / stripQuantities", () => {
  it("matches by quote, by numbers on the ingredient's line, or by wording", () => {
    expect(quantityAppearsIn(SOUP_DESCRIPTION, "2 tablespoons", "Olive oil", "2 tablespoons olive oil")).toBe("2 tablespoons olive oil");
    expect(quantityAppearsIn(SOUP_DESCRIPTION, "4 cups", "Broth", null)).toBe("4 cups chicken or veggie broth");
    expect(quantityAppearsIn(SOUP_DESCRIPTION, "to taste", "Black pepper", null)).toBe("salt and pepper to taste");
    expect(quantityAppearsIn(SOUP_DESCRIPTION, "6 cups", "Broth", null)).toBeNull();
    expect(quantityAppearsIn("1½ cups flour", "1 1/2 cups", "Flour", null)).toBe("1½ cups flour");
  });

  it("removes amounts but keeps times and counts of whole items", () => {
    expect(stripQuantities("Add 2 tbsp of butter (about 30 g) and cook for 5 minutes.")).toBe("Add butter and cook for 5 minutes.");
    expect(stripQuantities("Whisk 2 eggs.")).toBe("Whisk 2 eggs.");
  });
});

describe("Instagram prompt", () => {
  it("is derived from the YouTube prompt with every Instagram-specific edit applied", async () => {
    const { INSTAGRAM_PROMPT, SYSTEM_PROMPT } = await import("@/lib/pipeline/prompt");
    expect(INSTAGRAM_PROMPT).not.toBe(SYSTEM_PROMPT);
    for (const phrase of ["You do NOT get the video", '"caption": appears in the CAPTION block', "Without a TRANSCRIPT block", "use that line's start time", "Never fill in a recipe from general knowledge"]) {
      expect(INSTAGRAM_PROMPT).toContain(phrase);
    }
    for (const gone of ["You get the video itself", '"description": appears in the DESCRIPTION block']) expect(INSTAGRAM_PROMPT).not.toContain(gone);
  });
});

describe("quantityAppearsIn for transcripts", () => {
  const transcript = "[0:20] for the secret we melt butter with a little bit\n[0:24] of beer soak a cheesecloth\n[0:16] we also add an orange and tie the legs";
  it("matches across a line break only when asked (transcripts)", () => {
    expect(quantityAppearsIn(transcript, "a little bit", "Beer", null, { joinLines: true })).toContain("of beer");
    expect(quantityAppearsIn(transcript, "a little bit", "Beer", null)).toBeNull();
  });
  it("reads 'an orange' as 1", () => {
    expect(quantityAppearsIn(transcript, "1", "Orange", null)).toContain("an orange");
    expect(quantityAppearsIn(transcript, "2", "Orange", null)).toBeNull();
  });
  it("never lets a neighbouring ingredient line vouch for an amount", () => {
    expect(quantityAppearsIn("2 tablespoons olive oil\n1 diced yellow onion", "2 tablespoons", "Yellow onion", null)).toBeNull();
  });
});
