import type { ViewIngredient, ViewStep } from "./edits";
import { stem } from "./preparation";

/**
 * Cook Mode shows the ingredients a step needs and tucks away ones measured in an earlier step
 * ("Toss in the crispy pasta" doesn't need all 12 amounts again). Rules, in order:
 * 1. First used in this step: shown.
 * 2. Used before but named in this step's instruction ("Roll in sugar", "Garnish with parmesan"):
 *    shown, because the cook may need more of it now.
 * 3. Otherwise (used before, not named): "Already added", collapsed but one tap away.
 */
const GENERIC = new Set(["fresh", "freshly", "grated", "unsalted", "salted", "large", "small", "medium", "whole", "dry", "dried", "ground", "plain", "extra", "virgin", "chopped", "diced", "minced", "sliced", "optional"]);

const norm = (word: string) => stem(word).replace(/s$/, "");
const words = (text: string) => text.toLowerCase().split(/[^a-z]+/).filter((w) => w.length >= 3);

export function namedIn(text: string, name: string): boolean {
  const inText = new Set(words(text).map(norm));
  return words(name)
    .filter((w) => !GENERIC.has(w))
    .some((w) => inText.has(norm(w)));
}

export function splitStepIngredients(steps: ViewStep[], index: number): { now: ViewIngredient[]; earlier: ViewIngredient[] } {
  const usedBefore = new Set(steps.slice(0, index).flatMap((s) => s.ingredientIds));
  const step = steps[index];
  const now: ViewIngredient[] = [];
  const earlier: ViewIngredient[] = [];
  for (const ing of step?.ingredients ?? []) {
    (usedBefore.has(ing.id) && !namedIn(step.text, ing.name) ? earlier : now).push(ing);
  }
  return { now, earlier };
}
