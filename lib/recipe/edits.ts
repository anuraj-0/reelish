import { z } from "zod";
import { quantityLabel, type QuantityLabel } from "./labels";
import { Quantity, type Ingredient, type Recipe, type Step } from "./schema";

/**
 * The user's corrections, stored separately from the extracted recipe.
 * Keyed by ingredient id. The original recipe is never modified.
 */
export const RecipeEdits = z.object({
  quantities: z.record(z.string(), Quantity),
});
export type RecipeEdits = z.infer<typeof RecipeEdits>;

export const EMPTY_EDITS: RecipeEdits = { quantities: {} };

export type ViewIngredient = Ingredient & {
  /** What to show: the user's quantity if edited, otherwise the extracted one. */
  displayQuantity: Ingredient["quantity"];
  label: QuantityLabel;
  edited: boolean;
  /** The extracted quantity and its label, kept for "revert" and context. */
  original: { quantity: Ingredient["quantity"]; label: Exclude<QuantityLabel, "edited"> };
};

export type ViewStep = Step & { ingredients: ViewIngredient[] };

export type ViewRecipe = Omit<Recipe, "ingredients" | "steps"> & {
  ingredients: ViewIngredient[];
  steps: ViewStep[];
};

/** Merge edits over the extracted recipe for display. Pure; never mutates `recipe`. */
export function applyEdits(recipe: Recipe, edits: RecipeEdits): ViewRecipe {
  const ingredients: ViewIngredient[] = recipe.ingredients.map((ing) => {
    const originalLabel = quantityLabel(ing);
    const override = edits.quantities[ing.id];
    return {
      ...ing,
      displayQuantity: override ?? ing.quantity,
      label: override ? "edited" : originalLabel,
      edited: Boolean(override),
      original: { quantity: ing.quantity, label: originalLabel },
    };
  });
  const byId = new Map(ingredients.map((i) => [i.id, i]));
  const steps: ViewStep[] = recipe.steps.map((step) => ({
    ...step,
    ingredients: step.ingredientIds.flatMap((id) => byId.get(id) ?? []),
  }));
  return { ...recipe, ingredients, steps };
}

export function setQuantity(edits: RecipeEdits, ingredientId: string, quantity: z.infer<typeof Quantity>): RecipeEdits {
  return { ...edits, quantities: { ...edits.quantities, [ingredientId]: quantity } };
}

export function revertQuantity(edits: RecipeEdits, ingredientId: string): RecipeEdits {
  const rest = { ...edits.quantities };
  delete rest[ingredientId];
  return { ...edits, quantities: rest };
}

/** Required ingredients still without an amount. Optional extras (e.g. a garnish) don't count. */
export function missingQuantityCount(view: ViewRecipe): number {
  return view.ingredients.filter((i) => i.displayQuantity === null && !i.optional).length;
}

export function requiredIngredientCount(view: ViewRecipe): number {
  return view.ingredients.filter((i) => !i.optional).length;
}
