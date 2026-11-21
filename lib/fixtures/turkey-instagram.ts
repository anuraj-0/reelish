import type { Recipe } from "@/lib/recipe/schema";

// Source: the Reel's speech (spike/results/I3-turkey.sd-transcript.json; the on-screen text only
// repeats it). The caption is empty and links nowhere, so no amounts, temperatures or times exist.
// Deliberately incomplete: this is our "missing quantities" test case.
const said = (excerpt: string, t: number) => ({ source: "video_speech" as const, excerpt, videoTimestampSec: t });

export const turkeyInstagram: Recipe = {
  id: "ig-DPeUV0GjQnF",
  schemaVersion: 1,
  source: {
    platform: "instagram",
    videoId: "DPeUV0GjQnF",
    url: "https://www.instagram.com/reel/DPeUV0GjQnF/",
    creator: { name: "The Modern Nonna", handle: "themodernnonna" },
    videoTitle: null,
    thumbnailUrl: null,
    linkedRecipeUrls: [],
  },
  title: "Juicy Roast Turkey with a Butter-and-Beer Cheesecloth",
  servings: null,
  prepTime: null,
  cookTime: null,
  totalTime: null,
  ingredients: [
    { id: "turkey", name: "Whole turkey", group: null, quantity: null, quantityStatus: "missing", preparation: "thawed, patted dry, giblets removed", optional: false, evidence: [said("make sure the turkey has thawed, you pat it dry and you take out the giblets", 9)] },
    { id: "butter-rub", name: "Butter, softened", group: "Seasoned butter", quantity: null, quantityStatus: "missing", preparation: null, optional: false, evidence: [said("to soften butter add the seasonings", 4)] },
    { id: "seasonings", name: "Seasonings", group: "Seasoned butter", quantity: null, quantityStatus: "missing", preparation: null, optional: false, evidence: [said("add the seasonings", 4)] },
    { id: "orange", name: "Orange", group: null, quantity: { raw: "1", amount: 1, amountMax: null, unit: null }, quantityStatus: "stated", preparation: null, optional: false, evidence: [said("we also add an orange", 16)] },
    { id: "butter-melt", name: "Butter, for melting", group: "Cheesecloth soak", quantity: null, quantityStatus: "missing", preparation: null, optional: false, evidence: [said("we melt butter with a little bit of beer", 20)] },
    { id: "beer", name: "Beer", group: "Cheesecloth soak", quantity: { raw: "a little", amount: null, amountMax: null, unit: null }, quantityStatus: "stated", preparation: null, optional: false, evidence: [said("a little bit of beer", 20)] },
    { id: "water", name: "Water", group: "Roasting tray", quantity: null, quantityStatus: "missing", preparation: null, optional: false, evidence: [said("to the tray I'm adding some more water and beer", 28)] },
    { id: "beer-tray", name: "Beer, for the tray", group: "Roasting tray", quantity: null, quantityStatus: "missing", preparation: null, optional: false, evidence: [said("some more water and beer", 28)] },
  ],
  steps: [
    { id: "s1", text: "Mix the softened butter with the seasonings.", ingredientIds: ["butter-rub", "seasonings"], duration: null, temperature: null, heat: null, doneCue: "well mixed", videoTimestampSec: 4, evidence: [said("to soften butter add the seasonings, give it a good mix", 4)] },
    { id: "s2", text: "Make sure the turkey is fully thawed. Pat it dry and remove the giblets.", ingredientIds: ["turkey"], duration: null, temperature: null, heat: null, doneCue: null, videoTimestampSec: 9, evidence: [said("make sure the turkey has thawed, you pat it dry and you take out the giblets", 9)] },
    { id: "s3", text: "Massage the seasoned butter all over the turkey, including under the skin.", ingredientIds: ["turkey", "butter-rub"], duration: null, temperature: null, heat: null, doneCue: null, videoTimestampSec: 12, evidence: [said("massage it with the butter really well, I like to get under the skin", 12)] },
    { id: "s4", text: "Put the orange inside the turkey and tie the legs together.", ingredientIds: ["orange", "turkey"], duration: null, temperature: null, heat: null, doneCue: null, videoTimestampSec: 16, evidence: [said("in the crevice we also add an orange and tie the legs", 16)] },
    { id: "s5", text: "Melt butter with a little beer. Soak a cheesecloth in it and lay it over the turkey.", ingredientIds: ["butter-melt", "beer"], duration: null, temperature: null, heat: null, doneCue: null, videoTimestampSec: 20, evidence: [said("we melt butter with a little bit of beer, soak a cheesecloth and put it on top of the turkey", 20)] },
    { id: "s6", text: "Add water and more beer to the roasting tray.", ingredientIds: ["water", "beer-tray"], duration: null, temperature: null, heat: null, doneCue: null, videoTimestampSec: 28, evidence: [said("to the tray I'm adding some more water and beer", 28)] },
    { id: "s7", text: "Roast in the oven, basting as it cooks.", ingredientIds: [], duration: null, temperature: null, heat: null, doneCue: null, videoTimestampSec: 28, evidence: [said("cooking it in the oven making sure to baste", 28)] },
    { id: "s8", text: "An hour before the turkey is done, remove the cheesecloth and keep roasting.", ingredientIds: [], duration: null, temperature: null, heat: null, doneCue: "golden", videoTimestampSec: 32, evidence: [said("an hour before the turkey is done remove the cheesecloth and continue to cook it until golden", 32)] },
    { id: "s9", text: "Let the turkey rest before carving.", ingredientIds: [], duration: null, temperature: null, heat: null, doneCue: null, videoTimestampSec: 36, evidence: [said("let it rest", 36)] },
  ],
  notes: [{ text: "The creator credits Julia Child's method for the butter-and-beer cheesecloth.", evidence: [said("we use Julia Child's method", 20)] }],
  conflicts: [],
  gaps: [
    "No amounts are given for the turkey, butter, seasonings, water or beer.",
    "The seasonings aren't named.",
    "No oven temperature is given.",
    "No total roasting time is given, so you'll need to time it by the turkey's weight.",
    "Number of servings isn't given.",
  ],
  extraction: { status: "partial", pipelineVersion: "fixture-1", stages: ["caption", "transcript", "visual", "normalize"], createdAt: "2026-11-21T12:00:00.000Z" },
};
