import type { Recipe } from "@/lib/recipe/schema";

// Source: the Reel's own caption (spike/results/I2-pastasalad.sd-meta.json). The Reel has no speech.
const cap = (excerpt: string) => ({ source: "caption" as const, excerpt });
const q = (raw: string, amount: number | null, unit: string | null, amountMax: number | null = null) => ({ raw, amount, amountMax, unit });

export const pastaSaladInstagram: Recipe = {
  id: "ig-DWZqrugEacU",
  schemaVersion: 1,
  source: {
    platform: "instagram",
    videoId: "DWZqrugEacU",
    url: "https://www.instagram.com/reel/DWZqrugEacU/",
    creator: { name: "The Modern Nonna", handle: "themodernnonna" },
    videoTitle: null,
    thumbnailUrl: null,
    linkedRecipeUrls: [],
  },
  title: "Viral Crispy Pasta Salad",
  servings: null,
  prepTime: null,
  cookTime: null,
  totalTime: null,
  ingredients: [
    { id: "pasta", name: "Pasta shells", group: "Crispy pasta", quantity: q("150 g", 150, "g"), quantityStatus: "stated", preparation: null, optional: false, evidence: [cap("150g pasta shells")] },
    { id: "olive-oil", name: "Olive oil", group: "Crispy pasta", quantity: q("a drizzle", null, null), quantityStatus: "stated", preparation: null, optional: false, evidence: [cap("Drizzle of olive oil")] },
    { id: "parmesan", name: "Parmesan", group: "Crispy pasta", quantity: q("¼ cup", 0.25, "cup"), quantityStatus: "stated", preparation: "freshly grated", optional: false, evidence: [cap("¼ cup freshly grated parmesan")] },
    { id: "yogurt", name: "Plain yogurt", group: "Yogurt dressing", quantity: q("½ cup", 0.5, "cup"), quantityStatus: "stated", preparation: null, optional: false, evidence: [cap("½ cup plain yogurt")] },
    { id: "mustard", name: "Honey Dijon mustard", group: "Yogurt dressing", quantity: q("1 tbsp", 1, "tbsp"), quantityStatus: "stated", preparation: null, optional: false, evidence: [cap("1 tbsp honey Dijon mustard")] },
    { id: "vinegar", name: "White balsamic vinegar", group: "Yogurt dressing", quantity: q("½–1 tbsp, to taste", 0.5, "tbsp", 1), quantityStatus: "stated", preparation: null, optional: false, evidence: [cap("1/2-1 tbsp white balsamic vinegar, to taste")] },
    { id: "salt", name: "Salt", group: "Yogurt dressing", quantity: q("to taste", null, null), quantityStatus: "stated", preparation: null, optional: false, evidence: [cap("salt, to taste")] },
    { id: "romaine", name: "Romaine", group: "The veg", quantity: q("2 cups (½ head)", 2, "cups"), quantityStatus: "stated", preparation: "finely diced", optional: false, evidence: [cap("2 cups (½ head) romaine, finely diced")] },
    { id: "cucumber", name: "English cucumber", group: "The veg", quantity: q("½", 0.5, null), quantityStatus: "stated", preparation: "finely diced", optional: false, evidence: [cap("½ English cucumber, finely diced")] },
    { id: "tomatoes", name: "Cherry tomatoes", group: "The veg", quantity: q("1 cup", 1, "cup"), quantityStatus: "stated", preparation: "diced", optional: false, evidence: [cap("1 cup cherry tomatoes, diced")] },
    { id: "olives", name: "Kalamata olives", group: "The veg", quantity: q("¼ cup", 0.25, "cup"), quantityStatus: "stated", preparation: null, optional: false, evidence: [cap("¼ cup Kalamata olives")] },
    { id: "pepperoncini", name: "Pepperoncini", group: "The veg", quantity: q("⅛ cup", 0.125, "cup"), quantityStatus: "stated", preparation: "diced", optional: false, evidence: [cap("⅛ cup pepperoncini, diced")] },
  ],
  steps: [
    { id: "s1", text: "Cook the pasta in well-salted boiling water.", ingredientIds: ["pasta"], duration: null, temperature: null, heat: null, doneCue: "al dente", videoTimestampSec: null, evidence: [cap("Cook pasta in well-salted boiling water until al dente.")] },
    { id: "s2", text: "Drain, then toss the pasta with olive oil and parmesan.", ingredientIds: ["pasta", "olive-oil", "parmesan"], duration: null, temperature: null, heat: null, doneCue: null, videoTimestampSec: null, evidence: [cap("Drain, toss with olive oil and parm")] },
    { id: "s3", text: "Air fry the pasta, tossing halfway through.", ingredientIds: ["pasta"], duration: { raw: "10–12 minutes", minMinutes: 10, maxMinutes: 12 }, temperature: { raw: "390°F", value: 390, unit: "F" }, heat: null, doneCue: "golden and crispy", videoTimestampSec: null, evidence: [cap("air fry at 390°F for 10–12 minutes, tossing halfway, until golden and crispy")] },
    { id: "s4", text: "Whisk the yogurt, mustard, vinegar and salt together. Adjust to taste.", ingredientIds: ["yogurt", "mustard", "vinegar", "salt"], duration: null, temperature: null, heat: null, doneCue: null, videoTimestampSec: null, evidence: [cap("Whisk everything together and adjust to taste.")] },
    { id: "s5", text: "Add the vegetables and dressing to a bowl, then toss in the crispy pasta. Serve straight away so the pasta stays crunchy.", ingredientIds: ["romaine", "cucumber", "tomatoes", "olives", "pepperoncini"], duration: null, temperature: null, heat: null, doneCue: null, videoTimestampSec: null, evidence: [cap("Add the veg and dressing to a bowl, toss in the crispy pasta and enjoy! … Serve immediately for max crunch.")] },
  ],
  notes: [
    { text: "The creator says they prefer it without air frying the pasta, so you can skip that step.", evidence: [cap("I actually like this salad wayyyy more without air frying the pasta")] },
    { text: "All ingredients are to taste.", evidence: [cap("All ingredients to taste.")] },
    { text: "Inspired by @tablebymax.", evidence: [cap("IB: @tablebymax")] },
  ],
  conflicts: [],
  gaps: ["Number of servings isn't given."],
  extraction: { status: "complete", pipelineVersion: "fixture-1", stages: ["caption", "normalize"], createdAt: "2026-11-21T12:00:00.000Z" },
};
