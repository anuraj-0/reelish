import { describe, expect, it } from "vitest";
import { applyEdits, EMPTY_EDITS } from "@/lib/recipe/edits";
import { preparationAction, preparationStepIndex, stem } from "@/lib/recipe/preparation";
import type { Recipe } from "@/lib/recipe/schema";
import { soupYoutube } from "@/lib/fixtures/soup-youtube";

describe("preparation timing", () => {
  it("stems verbs so 'blended' matches 'blend', 'diced' matches 'dice', 'cutting' matches 'cut'", () => {
    expect([stem("blended"), stem("blend")]).toEqual(["blend", "blend"]);
    expect([stem("diced"), stem("dice")]).toEqual(["dic", "dic"]);
    expect([stem("cutting"), stem("cut")]).toEqual(["cut", "cut"]);
    expect([stem("chopped"), stem("chop")]).toEqual(["chop", "chop"]);
    expect(preparationAction("finely diced")).toBe("dic");
    expect(preparationAction("blended into a paste")).toBe("blend");
  });

  const step = (text: string, ingredientIds: string[]) => ({ text, ingredientIds });

  it("finds the step that performs the preparation", () => {
    const steps = [step("Wash the cashews with boiling water twice.", ["cashews"]), step("Blend the cashews into a paste.", ["cashews"]), step("Add the cashew paste to the syrup.", ["cashews"])];
    expect(preparationStepIndex({ id: "cashews", preparation: "blended into a paste" }, steps)).toBe(1);
    // Prep done before cooking: no step performs it.
    expect(preparationStepIndex({ id: "onion", preparation: "diced" }, [step("Add the onion.", ["onion"])])).toBeNull();
    // A step mentioning the verb but not using the ingredient doesn't count.
    expect(preparationStepIndex({ id: "cashews", preparation: "blended" }, [step("Blend the soup.", ["soup"])])).toBeNull();
  });

  it("hides the note in Cook Mode until the step that does it has passed", () => {
    const base = soupYoutube;
    const recipe: Recipe = {
      ...base,
      ingredients: [{ ...base.ingredients[0], id: "cashews", name: "Cashews", preparation: "blended into a paste" }, { ...base.ingredients[1], id: "water", name: "Water", preparation: "hot / boiling" }],
      steps: [
        { ...base.steps[0], id: "s1", text: "Wash the cashews with boiling water twice.", ingredientIds: ["cashews", "water"] },
        { ...base.steps[1], id: "s2", text: "Blend the cashews into a paste.", ingredientIds: ["cashews"] },
        { ...base.steps[2], id: "s3", text: "Cook the cashew paste with the syrup.", ingredientIds: ["cashews"] },
      ],
      conflicts: [],
    };
    const view = applyEdits(recipe, EMPTY_EDITS);
    expect(view.steps[0].ingredients.map((i) => i.preparation)).toEqual([null, "hot / boiling"]);
    expect(view.steps[1].ingredients[0].preparation).toBeNull();
    expect(view.steps[2].ingredients[0].preparation).toBe("blended into a paste");
    // The ingredient list (what you'll need) still shows it.
    expect(view.ingredients[0].preparation).toBe("blended into a paste");
  });

  it("leaves the saved soup's prep notes visible (diced, quartered: done beforehand)", () => {
    const view = applyEdits(soupYoutube, EMPTY_EDITS);
    expect(view.steps[0].ingredients.find((i) => i.id === "onion")?.preparation).toBe("diced");
  });
});
