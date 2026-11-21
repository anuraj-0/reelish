import type { Ingredient, Step } from "./schema";

/**
 * Some preparation notes describe work done during the recipe, not before it: "Cashews, blended
 * into a paste" is blended in step 2. Showing that note in step 1 ("Wash the cashews") is wrong.
 * We find the first step that uses the ingredient and performs the note's action (matched by
 * word stem); the note is shown only after that step. Notes no step performs ("diced",
 * "softened") are prep done beforehand and are shown everywhere.
 */

const SKIP = new Set(["a", "an", "the", "and", "or", "into", "in", "to", "of", "with", "very", "well", "roughly", "finely", "thinly", "lightly", "freshly"]);

export function stem(word: string): string {
  let w = word.toLowerCase().replace(/[^a-z]/g, "");
  if (w.length > 4) w = w.replace(/(ing|ed|es|s)$/, "");
  if (w.length > 3) w = w.replace(/e$/, "");
  if (w.length > 3 && /([b-df-hj-np-tv-z])\1$/.test(w)) w = w.slice(0, -1);
  return w;
}

/** The note's action word ("blended into a paste" → "blend"), or null. */
export function preparationAction(preparation: string): string | null {
  const word = preparation
    .toLowerCase()
    .split(/[^a-z]+/)
    .find((w) => w.length >= 3 && !SKIP.has(w) && !w.endsWith("ly"));
  return word ? stem(word) : null;
}

/** Index of the step that performs this ingredient's preparation, or null if none does. */
export function preparationStepIndex(ingredient: Pick<Ingredient, "id" | "preparation">, steps: Pick<Step, "text" | "ingredientIds">[]): number | null {
  if (!ingredient.preparation) return null;
  const action = preparationAction(ingredient.preparation);
  if (!action) return null;
  const index = steps.findIndex((s) => s.ingredientIds.includes(ingredient.id) && s.text.split(/[^A-Za-z]+/).some((w) => w && stem(w) === action));
  return index === -1 ? null : index;
}
