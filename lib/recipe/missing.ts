import { missingQuantityCount, requiredIngredientCount, type ViewRecipe } from "./edits";

/** Same test the pipeline uses to drop amount gaps: per-ingredient amounts are summarised in the headline instead. */
const AMOUNT_GAP = /\b(quantit(y|ies)|amounts?|how much)\b/i;

export type MissingNotice = {
  /** One sentence for the top of the recipe. */
  headline: string;
  /** The recipe's other gaps (oven temperature, times, servings…), never invented, just not repeated. */
  details: string[];
};

/**
 * What a cook should know is missing, in one place, instead of a label on every row.
 * Built only from the recipe's own data: required ingredients without an amount (after the user's
 * own additions) and the gaps the extraction recorded. Null when nothing is missing.
 */
export function missingNotice(view: ViewRecipe): MissingNotice | null {
  const missing = missingQuantityCount(view);
  const details = view.gaps.filter((g) => !AMOUNT_GAP.test(g));
  if (missing > 0) {
    const what = missing === requiredIngredientCount(view) ? "ingredient amounts" : `amounts for ${missing} ${missing === 1 ? "ingredient" : "ingredients"}`;
    return { headline: `This video doesn't include ${what}.`, details };
  }
  if (details.length) return { headline: "A few details aren't in this video.", details };
  return null;
}
