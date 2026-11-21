import type { Recipe } from "@/lib/recipe/schema";

// Source: spike run C2 (YouTube Short + creator's linked recipe), with step timestamps
// checked against the Short's own captions (spike/results/Y2-soup-verify.sd-transcript.json).
// Speech excerpts are English paraphrases: the only caption track we retrieved was auto-translated.
// Quantities come from the creator's recipe page, which embeds this exact Short.
const RECIPE_URL = "https://themodernnonna.com/creamy-vegetable-soup/";
const linked = (excerpt: string) => ({ source: "linked_recipe" as const, excerpt, url: RECIPE_URL });
const said = (excerpt: string, t: number) => ({ source: "video_speech" as const, excerpt, videoTimestampSec: t });

export const soupYoutube: Recipe = {
  id: "yt-VTR8vxBFGDY",
  schemaVersion: 1,
  source: {
    platform: "youtube",
    videoId: "VTR8vxBFGDY",
    url: "https://www.youtube.com/watch?v=VTR8vxBFGDY",
    creator: { name: "The Modern Nonna", handle: null },
    videoTitle: "Mom & Dad taught me how to make the HEALTHIEST creamy soups without the heavy cream 🤯 #shorts",
    thumbnailUrl: "https://i.ytimg.com/vi/VTR8vxBFGDY/hqdefault.jpg",
    linkedRecipeUrls: [RECIPE_URL],
  },
  title: "Creamy Vegetable Soup",
  servings: { raw: "3", value: 3, evidence: [linked("Servings: 3")] },
  prepTime: null,
  cookTime: null,
  totalTime: { raw: "40 minutes", minutes: 40, evidence: [linked("Total time: PT40M")] },
  ingredients: [
    { id: "olive-oil", name: "Olive oil", group: null, quantity: { raw: "2 tablespoons", amount: 2, amountMax: null, unit: "tablespoons" }, quantityStatus: "stated", preparation: null, optional: false, evidence: [linked("2 tablespoons olive oil")] },
    { id: "onion", name: "Onion", group: null, quantity: { raw: "1", amount: 1, amountMax: null, unit: null }, quantityStatus: "stated", preparation: "diced", optional: false, evidence: [linked("1 onion (diced)"), said("onion", 6)] },
    { id: "carrots", name: "Carrots", group: null, quantity: { raw: "2", amount: 2, amountMax: null, unit: null }, quantityStatus: "stated", preparation: "diced", optional: false, evidence: [linked("2 carrots (diced)"), said("carrots", 6)] },
    { id: "celery", name: "Celery", group: null, quantity: { raw: "2 ribs", amount: 2, amountMax: null, unit: "ribs" }, quantityStatus: "stated", preparation: null, optional: false, evidence: [linked("2 celery ribs"), said("celery", 6)] },
    { id: "garlic", name: "Garlic", group: null, quantity: { raw: "2 cloves", amount: 2, amountMax: null, unit: "cloves" }, quantityStatus: "stated", preparation: "quartered", optional: false, evidence: [linked("2 garlic cloves (quartered)"), said("garlic", 6)] },
    { id: "salt", name: "Salt", group: null, quantity: { raw: "to taste", amount: null, amountMax: null, unit: null }, quantityStatus: "stated", preparation: null, optional: false, evidence: [linked("salt (to taste)"), said("salt … to taste", 9)] },
    { id: "pepper", name: "Black pepper", group: null, quantity: { raw: "to taste", amount: null, amountMax: null, unit: null }, quantityStatus: "stated", preparation: null, optional: false, evidence: [linked("pepper (to taste)"), said("pepper … to taste", 9)] },
    { id: "cauliflower", name: "Cauliflower", group: null, quantity: { raw: "5 cups (1 small head)", amount: 5, amountMax: null, unit: "cups" }, quantityStatus: "stated", preparation: "cut into florets", optional: false, evidence: [linked("5 cups cauliflower (small head)"), said("cauliflower", 11)] },
    { id: "potatoes", name: "Potatoes", group: null, quantity: { raw: "3", amount: 3, amountMax: null, unit: null }, quantityStatus: "stated", preparation: "peeled and quartered", optional: false, evidence: [linked("3 potatoes (peeled and quartered)"), said("potatoes", 11)] },
    { id: "broth", name: "Chicken broth", group: null, quantity: { raw: "4 cups", amount: 4, amountMax: null, unit: "cups" }, quantityStatus: "stated", preparation: null, optional: false, evidence: [linked("4 cups chicken broth"), said("my favourite organic Kettle & Fire broth", 12), { source: "video_visual", excerpt: "32 oz carton" }] },
    { id: "water", name: "Water", group: null, quantity: { raw: "2 cups", amount: 2, amountMax: null, unit: "cups" }, quantityStatus: "stated", preparation: null, optional: false, evidence: [linked("2 cups water"), said("a little water", 14)] },
    { id: "chives", name: "Chives", group: "To serve", quantity: null, quantityStatus: "missing", preparation: null, optional: true, evidence: [linked("chives + bacon bits for presentation are optional"), { source: "video_visual", excerpt: "garnish" }] },
    { id: "bacon", name: "Bacon bits", group: "To serve", quantity: null, quantityStatus: "missing", preparation: null, optional: true, evidence: [linked("chives + bacon bits for presentation are optional"), { source: "video_visual", excerpt: "garnish" }] },
  ],
  steps: [
    { id: "s1", text: "Heat the olive oil in a large pot. Add the onion, carrots, celery and garlic and sauté for a few minutes. No need to chop finely; it all gets blended.", ingredientIds: ["olive-oil", "onion", "carrots", "celery", "garlic"], duration: { raw: "a few minutes", minMinutes: null, maxMinutes: null }, temperature: null, heat: "medium-high", doneCue: null, videoTimestampSec: 6, evidence: [said("sauté the onion, carrots, celery and garlic for a few minutes", 6), linked("on medium high heat add olive oil and add the onions")] },
    { id: "s2", text: "Season with salt and pepper and stir.", ingredientIds: ["salt", "pepper"], duration: null, temperature: null, heat: null, doneCue: null, videoTimestampSec: 9, evidence: [said("add salt and pepper to taste", 9), linked("Season with salt, pepper, and stir again.")] },
    { id: "s3", text: "Add the cauliflower and potatoes.", ingredientIds: ["cauliflower", "potatoes"], duration: null, temperature: null, heat: null, doneCue: null, videoTimestampSec: 11, evidence: [said("add the cauliflower and potatoes", 11), linked("Add the cauliflower florets and potatoes.")] },
    { id: "s4", text: "Pour in the broth and water, just enough to cover the vegetables, and bring to a boil.", ingredientIds: ["broth", "water"], duration: null, temperature: null, heat: null, doneCue: "comes to a boil", videoTimestampSec: 12, evidence: [said("I add my favourite broth with a little water", 12), linked("Cover with enough stock and water … Let it come to a boil.")] },
    { id: "s5", text: "Lower the heat, partly cover with a lid and simmer.", ingredientIds: [], duration: { raw: "25–30 minutes", minMinutes: 25, maxMinutes: 30 }, temperature: null, heat: "medium-low", doneCue: "the vegetables are soft", videoTimestampSec: 17, evidence: [said("partially cover and leave on low heat for about 30 minutes", 17), linked("Reduce the heat to medium-low … cook for 25 to 30 minutes or until the veggies are soft.")] },
    { id: "s6", text: "Blend the vegetables and broth until smooth, with a stick blender or in batches in a blender. Taste and add salt if needed.", ingredientIds: [], duration: null, temperature: null, heat: null, doneCue: "smooth", videoTimestampSec: 21, evidence: [said("blend the vegetables with the broth until smooth", 21), linked("use a stick blender to blend until smooth … taste for salt")] },
    { id: "s7", text: "Serve, topped with chives and bacon bits if you like.", ingredientIds: ["chives", "bacon"], duration: null, temperature: null, heat: null, doneCue: null, videoTimestampSec: 24, evidence: [linked("Serve with bacon bits and chives."), { source: "video_visual", excerpt: "garnished bowl", videoTimestampSec: 24 }] },
  ],
  notes: [],
  conflicts: [
    { path: "ingredients.broth.quantity", description: "The video shows a 32 oz carton; the written recipe says 4 cups. These are the same amount.", chosen: "linked_recipe", alternatives: [{ value: "32 oz", source: "video_visual" }] },
  ],
  gaps: [],
  extraction: { status: "complete", pipelineVersion: "fixture-1", stages: ["metadata", "linked_recipe", "video", "normalize"], createdAt: "2026-11-21T12:00:00.000Z" },
};
