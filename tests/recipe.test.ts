import { describe, expect, it } from "vitest";
import { FIXTURE_RECIPES } from "@/lib/fixtures";
import { soupYoutube } from "@/lib/fixtures/soup-youtube";
import { turkeyInstagram } from "@/lib/fixtures/turkey-instagram";
import { applyEdits, EMPTY_EDITS, missingQuantityCount, revertQuantity, setQuantity } from "@/lib/recipe/edits";
import { quantityLabel } from "@/lib/recipe/labels";
import { parseQuantity } from "@/lib/recipe/quantity";
import { Recipe } from "@/lib/recipe/schema";

function deepFreeze<T>(o: T): T {
  Object.freeze(o);
  for (const v of Object.values(o as object)) if (v && typeof v === "object" && !Object.isFrozen(v)) deepFreeze(v);
  return o;
}

describe("Recipe schema", () => {
  it.each(FIXTURE_RECIPES.map((r) => [r.id, r]))("fixture %s is valid", (_id, recipe) => {
    const result = Recipe.safeParse(recipe);
    expect(result.success, JSON.stringify(result.error?.issues, null, 2)).toBe(true);
  });

  it("rejects a quantity on an ingredient marked missing", () => {
    const bad = structuredClone(turkeyInstagram);
    bad.ingredients[0].quantity = { raw: "5 kg", amount: 5, amountMax: null, unit: "kg" };
    expect(Recipe.safeParse(bad).success).toBe(false);
  });

  it("rejects a stated quantity with no quantity value", () => {
    const bad = structuredClone(soupYoutube);
    bad.ingredients[0].quantity = null;
    expect(Recipe.safeParse(bad).success).toBe(false);
  });

  it("rejects a step referencing an unknown ingredient", () => {
    const bad = structuredClone(soupYoutube);
    bad.steps[0].ingredientIds.push("does-not-exist");
    expect(Recipe.safeParse(bad).success).toBe(false);
  });

  it("rejects facts without evidence", () => {
    const bad = structuredClone(soupYoutube);
    bad.ingredients[1].evidence = [];
    expect(Recipe.safeParse(bad).success).toBe(false);
  });

  it("rejects duplicate ingredient ids", () => {
    const bad = structuredClone(soupYoutube);
    bad.ingredients[1].id = bad.ingredients[0].id;
    expect(Recipe.safeParse(bad).success).toBe(false);
  });
});

describe("parseQuantity", () => {
  it.each([
    ["2 cups", 2, null, "cups"],
    ["150g", 150, null, "g"],
    ["½ cup", 0.5, null, "cup"],
    ["1½ tbsp", 1.5, null, "tbsp"],
    ["1 1/2 tsp", 1.5, null, "tsp"],
    ["1/2-1 tbsp", 0.5, 1, "tbsp"],
    ["½–1 tbsp", 0.5, 1, "tbsp"],
    ["2 to 3 cloves", 2, 3, "cloves"],
    ["3", 3, null, null],
    ["2 cloves (quartered)", 2, null, "cloves"],
    ["0,5 kg", 0.5, null, "kg"],
  ])("%s", (raw, amount, amountMax, unit) => {
    expect(parseQuantity(raw)).toEqual({ raw, amount, amountMax, unit });
  });

  it("keeps non-numeric quantities as raw text", () => {
    expect(parseQuantity("a drizzle")).toEqual({ raw: "a drizzle", amount: null, amountMax: null, unit: null });
    expect(parseQuantity("to taste")).toEqual({ raw: "to taste", amount: null, amountMax: null, unit: null });
  });

  it("returns null for empty input and normalises whitespace", () => {
    expect(parseQuantity("   ")).toBeNull();
    expect(parseQuantity("  2   cups ")?.raw).toBe("2 cups");
  });
});

describe("quantityLabel", () => {
  const ev = (source: Parameters<typeof quantityLabel>[0]["evidence"][number]["source"]) => [{ source }];
  it("maps creator sources to confirmed", () => {
    for (const s of ["video_speech", "video_on_screen_text", "caption", "description", "linked_recipe"] as const) {
      expect(quantityLabel({ quantityStatus: "stated", evidence: ev(s) })).toBe("confirmed");
    }
  });
  it("treats visual-only and estimated quantities as suggested", () => {
    expect(quantityLabel({ quantityStatus: "stated", evidence: ev("video_visual") })).toBe("suggested");
    expect(quantityLabel({ quantityStatus: "suggested", evidence: ev("caption") })).toBe("suggested");
    expect(quantityLabel({ quantityStatus: "stated", evidence: ev("model_estimate") })).toBe("suggested");
  });
  it("maps missing to not specified", () => {
    expect(quantityLabel({ quantityStatus: "missing", evidence: ev("video_speech") })).toBe("not_specified");
  });
});

describe("applyEdits", () => {
  it("shows a user quantity in the ingredient list and in every step that uses it, without touching the original", () => {
    const original = deepFreeze(structuredClone(turkeyInstagram));
    const snapshot = JSON.stringify(original);
    const edits = setQuantity(EMPTY_EDITS, "butter-rub", parseQuantity("1 stick")!);

    const view = applyEdits(original, edits);

    const ing = view.ingredients.find((i) => i.id === "butter-rub")!;
    expect(ing.displayQuantity?.raw).toBe("1 stick");
    expect(ing.label).toBe("edited");
    expect(ing.original).toEqual({ quantity: null, label: "not_specified" });

    const stepsUsingButter = view.steps.filter((s) => s.ingredientIds.includes("butter-rub"));
    expect(stepsUsingButter.length).toBeGreaterThan(1);
    for (const s of stepsUsingButter) {
      expect(s.ingredients.find((i) => i.id === "butter-rub")?.displayQuantity?.raw).toBe("1 stick");
    }

    expect(JSON.stringify(original)).toBe(snapshot);
    expect(original.ingredients.find((i) => i.id === "butter-rub")?.quantity).toBeNull();
  });

  it("reverting restores the extracted quantity and label", () => {
    const edits = revertQuantity(setQuantity(EMPTY_EDITS, "broth", parseQuantity("1 litre")!), "broth");
    const ing = applyEdits(soupYoutube, edits).ingredients.find((i) => i.id === "broth")!;
    expect(ing.displayQuantity?.raw).toBe("4 cups");
    expect(ing.label).toBe("confirmed");
    expect(ing.edited).toBe(false);
  });

  it("counts quantities the user can still fill in", () => {
    const view = applyEdits(turkeyInstagram, EMPTY_EDITS);
    expect(missingQuantityCount(view)).toBe(6);
    expect(missingQuantityCount(applyEdits(turkeyInstagram, setQuantity(EMPTY_EDITS, "turkey", parseQuantity("5 kg")!)))).toBe(5);
  });

  it("keeps step ingredients in the step's own order", () => {
    const step = applyEdits(soupYoutube, EMPTY_EDITS).steps[0];
    expect(step.ingredients.map((i) => i.id)).toEqual(step.ingredientIds);
  });
});
