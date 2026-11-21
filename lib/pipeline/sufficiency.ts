/**
 * Is the creator's text already a recipe? Deterministic, no AI (PLAN §4). When it is, the
 * Instagram pipeline skips the paid transcript and visual steps.
 *
 * Sufficient when the linked page has a usable JSON-LD recipe, or the caption has at least
 * 3 ingredient lines with amounts and at least 2 instruction-like lines.
 */

const FRACTION = "½⅓⅔¼¾⅛⅜⅝⅞";
const UNIT =
  "cups?|c\\.|tbsps?|tablespoons?|tsps?|teaspoons?|g|grams?|kg|ml|l|litres?|liters?|oz|ounces?|lbs?|pounds?|cloves?|sticks?|pinch(?:es)?|cans?|slices?|heads?|bunch(?:es)?|handfuls?|sprigs?|stalks?|pieces?";
// "150g pasta", "¼ cup parmesan", "1/2-1 tbsp vinegar", "2 eggs", "- 1 onion"
const AMOUNT_LINE = new RegExp(`^\\s*(?:[-•*·–]\\s*)?(?:\\d+(?:[.,/]\\d+)?|[${FRACTION}])(?:\\s*(?:-|–|to)\\s*(?:\\d+(?:[.,/]\\d+)?|[${FRACTION}]))?\\s*(?:(?:${UNIT})\\b|[a-z])`, "i");
// Lines that start like an instruction: "1.", "Step 2", or a cooking verb.
const VERBS =
  "add|bake|beat|blend|boil|bring|chop|combine|cook|cover|cut|dice|drain|drizzle|fold|fry|air fry|garnish|grate|grill|heat|knead|layer|marinate|melt|mix|place|pour|preheat|reduce|remove|roast|roll|saute|sauté|season|serve|simmer|slice|spread|stir|toss|transfer|whisk|sprinkle|top|let|chill|refrigerate|assemble|squeeze|rub|brush|wash|soak";
const INSTRUCTION_LINE = new RegExp(`^\\s*(?:(?:\\d+[.)]|step\\s*\\d+[:.)]?)\\s+\\S|(?:${VERBS})\\b)`, "i");

export function captionLooksLikeRecipe(caption: string): { sufficient: boolean; amountLines: number; instructionLines: number } {
  const lines = caption.split(/\r?\n|(?<=[.!?])\s+(?=[A-Z])/).map((l) => l.trim()).filter(Boolean);
  const amountLines = lines.filter((l) => AMOUNT_LINE.test(l)).length;
  const instructionLines = lines.filter((l) => INSTRUCTION_LINE.test(l) && !AMOUNT_LINE.test(l)).length;
  return { sufficient: amountLines >= 3 && instructionLines >= 2, amountLines, instructionLines };
}

/** Rough count of real words in a transcript ("[0:03] add a touch of oil"). */
export function spokenWords(text: string): number {
  return (text.match(/\b[\p{L}']{2,}\b/gu) ?? []).length;
}
