import type { Recipe } from "./schema";

/**
 * Finds amounts written inside step text ("add 2 cups broth"). Amounts must live on the
 * ingredient, not in the instruction; otherwise a user's edit would leave the step saying
 * something different. Times and temperatures are allowed (they belong to the step).
 * M2's normalizer must keep this list empty, rewriting or flagging any step that fails.
 */
const UNITS = [
  "cups?", "tbsps?", "tablespoons?", "tsps?", "teaspoons?", "g", "grams?", "kg", "kilograms?", "ml", "millilit(?:er|re)s?",
  "l", "lit(?:er|re)s?", "oz", "ounces?", "lbs?", "pounds?", "cloves?", "sticks?", "pinch(?:es)?", "cans?", "slices?",
].join("|");
const NUMBER = "(?:\\d+(?:[.,/]\\d+)?|[½⅓⅔¼¾⅛⅜⅝⅞])(?:\\s*(?:-|–|to)\\s*(?:\\d+(?:[.,/]\\d+)?|[½⅓⅔¼¾⅛⅜⅝⅞]))?";
const QUANTITY_IN_TEXT = new RegExp(`(?<![\\w°])${NUMBER}\\s*(?:${UNITS})\\b`, "gi");

export type StepQuantityIssue = { stepId: string; matches: string[] };

export function quantitiesInStepText(recipe: Pick<Recipe, "steps">): StepQuantityIssue[] {
  return recipe.steps.flatMap((step) => {
    const matches = step.text.match(QUANTITY_IN_TEXT);
    return matches ? [{ stepId: step.id, matches }] : [];
  });
}
