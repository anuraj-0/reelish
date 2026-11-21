import { LlmRecipe } from "@/lib/pipeline/prompt";

/** A model answer in our prompt's shape for the soup Short, modelled on spike run C2. */
export const soupLlmRaw = {
  is_recipe: true,
  title: "Creamy Vegetable Soup",
  servings: { text: "3", sources: ["linked_recipe"] },
  prep_time: null,
  cook_time: null,
  total_time: { text: "40 minutes", sources: ["linked_recipe"] },
  ingredients: [
    { id: "olive-oil", name: "Olive oil", group: null, quantity: "2 tablespoons", quantity_source: "description", quantity_quote: "2 tablespoons olive oil", preparation: null, optional: false, sources: ["description", "linked_recipe"] },
    { id: "onion", name: "Yellow onion", group: null, quantity: "1", quantity_source: "description", quantity_quote: "1 diced yellow onion", preparation: "diced", optional: false, sources: ["description", "video_speech"] },
    { id: "cauliflower", name: "Cauliflower", group: null, quantity: "1 small head (about 5 cups)", quantity_source: "description", quantity_quote: null, preparation: "separated into florets", optional: false, sources: ["description", "video_speech"] },
    { id: "salt", name: "Salt", group: null, quantity: "to taste", quantity_source: "description", quantity_quote: "salt and pepper to taste", preparation: null, optional: false, sources: ["description"] },
    { id: "broth", name: "Chicken or veggie broth", group: null, quantity: "4 cups", quantity_source: "linked_recipe", quantity_quote: "4 cups chicken broth", preparation: null, optional: false, sources: ["linked_recipe", "video_visual"] },
    { id: "chives", name: "Chives", group: "To serve", quantity: null, quantity_source: null, quantity_quote: null, preparation: null, optional: true, sources: ["description", "video_visual"] },
  ],
  steps: [
    { text: "Heat the olive oil in a large pot and sauté the onion for a few minutes.", ingredient_ids: ["olive-oil", "onion"], duration: "a few minutes", temperature: null, heat: "medium high", done_cue: null, video_timestamp: "0:06", sources: ["video_speech", "linked_recipe"], quote: "on medium high heat add olive oil and add the onions" },
    { text: "Add the cauliflower and season with salt.", ingredient_ids: ["cauliflower", "salt"], duration: null, temperature: null, heat: null, done_cue: null, video_timestamp: "0:11", sources: ["video_speech"], quote: null },
    { text: "Pour in the broth, bring to a boil, then simmer partly covered.", ingredient_ids: ["broth"], duration: "25 to 30 minutes", temperature: null, heat: "medium-low", done_cue: "until the veggies are soft", video_timestamp: "0:17", sources: ["video_speech", "linked_recipe"], quote: null },
    { text: "Blend until smooth and serve with chives.", ingredient_ids: ["chives"], duration: null, temperature: null, heat: null, done_cue: "smooth", video_timestamp: "0:21", sources: ["video_speech"], quote: null },
  ],
  notes: [{ text: "Potatoes make it creamy without cream.", sources: ["description"] }],
  conflicts: [{ ingredient_id: "broth", description: "The video shows a 32 oz carton; the written recipe says 4 cups.", chosen_source: "linked_recipe", alternatives: [{ value: "32 oz", source: "video_visual" }] }],
  gaps: [],
};

export const soupLlm = () => LlmRecipe.parse(structuredClone(soupLlmRaw));

export const LINKED_TEXT = `URL: https://themodernnonna.com/creamy-vegetable-soup/
This page embeds the video: yes
Title: Creamy Vegetable Soup
Servings: 3 / 3 servings
Total time: 40 minutes
Ingredients:
- 2 tablespoons olive oil
- 1 onion (diced)
- 5 cups cauliflower (small head )
- 4 cups chicken broth
- 2 cups water
Instructions:
1. In a big pot on the stove on medium high heat add olive oil and add the onions.
2. Cover with enough stock and water. Reduce the heat to medium-low, cook for 25 to 30 minutes or until the veggies are soft.`;
