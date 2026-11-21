import type { Recipe } from "@/lib/recipe/schema";

// Source: spike run T2 (video only; the title is just hashtags, no description used).
// Steps were read from the video and are NOT independently verified, so they're labelled as
// visual evidence. Every quantity is missing. Our "silent video" test case.
const seen = (excerpt: string, t: number) => ({ source: "video_visual" as const, excerpt, videoTimestampSec: t });

export const kajuKatliYoutube: Recipe = {
  id: "yt-s4na199iyag",
  schemaVersion: 1,
  source: {
    platform: "youtube",
    videoId: "s4na199iyag",
    url: "https://www.youtube.com/watch?v=s4na199iyag",
    creator: { name: "Foodie Gamer Adventures", handle: null },
    videoTitle: "Kaju Takli Fuljhari! #ytshortsindia #shortsfeed #trendingshorts #viralshorts #trendingreels #viral",
    thumbnailUrl: "https://i.ytimg.com/vi/s4na199iyag/hqdefault.jpg",
    linkedRecipeUrls: [],
  },
  title: "Kaju Katli Phuljhari (Cashew Fudge Sparklers)",
  servings: null,
  prepTime: null,
  cookTime: null,
  totalTime: null,
  ingredients: [
    { id: "cashews", name: "Cashews", group: null, quantity: null, quantityStatus: "missing", preparation: null, optional: false, evidence: [seen("cashews", 11)] },
    { id: "sugar", name: "Sugar", group: null, quantity: null, quantityStatus: "missing", preparation: null, optional: false, evidence: [seen("sugar", 20)] },
    { id: "water", name: "Water", group: null, quantity: null, quantityStatus: "missing", preparation: null, optional: false, evidence: [seen("water", 11)] },
    { id: "cocoa", name: "Cocoa powder", group: null, quantity: null, quantityStatus: "missing", preparation: null, optional: false, evidence: [seen("cocoa powder", 41)] },
    { id: "silver", name: "Edible silver dust", group: "To decorate", quantity: null, quantityStatus: "missing", preparation: null, optional: false, evidence: [seen("edible silver dust", 58)] },
  ],
  steps: [
    { id: "s1", text: "Rinse the cashews twice with hot water.", ingredientIds: ["cashews", "water"], duration: null, temperature: null, heat: null, doneCue: null, videoTimestampSec: 11, evidence: [seen("rinse cashews with hot water twice", 11)] },
    { id: "s2", text: "Grind the cashews into a paste in a mixer.", ingredientIds: ["cashews"], duration: null, temperature: null, heat: null, doneCue: null, videoTimestampSec: 17, evidence: [seen("grind the washed cashews into a paste", 17)] },
    { id: "s3", text: "In a pan, boil sugar and water into a syrup.", ingredientIds: ["sugar", "water"], duration: null, temperature: null, heat: null, doneCue: "sticky", videoTimestampSec: 20, evidence: [seen("boiling sugar and water until sticky", 20)] },
    { id: "s4", text: "Add the cashew paste to the syrup and cook, stirring, until it forms a dough.", ingredientIds: ["cashews"], duration: null, temperature: null, heat: null, doneCue: "it comes together as a dough in the pan", videoTimestampSec: 30, evidence: [seen("cook while mixing until it forms a dough", 30)] },
    { id: "s5", text: "Move the mixture onto butter paper, add the cocoa powder and knead to combine.", ingredientIds: ["cocoa"], duration: null, temperature: null, heat: null, doneCue: null, videoTimestampSec: 41, evidence: [seen("transfer to butter paper, add cocoa powder, and knead", 41)] },
    { id: "s6", text: "Shape small portions into sparkler sticks around wooden skewers.", ingredientIds: [], duration: null, temperature: null, heat: null, doneCue: null, videoTimestampSec: 47, evidence: [seen("shape them into sparkler (phuljhari) sticks using wooden skewers", 47)] },
    { id: "s7", text: "Roll the sticks in sugar.", ingredientIds: ["sugar"], duration: null, temperature: null, heat: null, doneCue: null, videoTimestampSec: 54, evidence: [seen("roll the shaped sticks over loose sugar granules", 54)] },
    { id: "s8", text: "Brush edible silver dust onto the tips.", ingredientIds: ["silver"], duration: null, temperature: null, heat: null, doneCue: null, videoTimestampSec: 58, evidence: [seen("paint edible silver dust onto the sticks", 58)] },
  ],
  notes: [],
  conflicts: [],
  gaps: ["No amounts are given for any ingredient.", "No cooking times or heat levels are given.", "Number of servings isn't given."],
  extraction: { status: "partial", pipelineVersion: "fixture-1", stages: ["metadata", "video", "normalize"], createdAt: "2026-11-21T12:00:00.000Z" },
};
