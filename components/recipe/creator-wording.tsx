import type { ViewIngredient } from "@/lib/recipe/edits";

/** For amounts that could be misread ("1 5kg"): the creator's line as written, so nobody has to guess. */
export function CreatorWording({ ingredient }: { ingredient: ViewIngredient }) {
  if (ingredient.creatorWording === null) return null;
  return (
    <span className="block text-sm text-suggested">
      {ingredient.creatorWording ? <>Creator wrote: “{ingredient.creatorWording}”</> : "This amount may be unclear. Check the creator's recipe."}
    </span>
  );
}
