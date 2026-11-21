import { describe, expect, it } from "vitest";
import { FIXTURE_RECIPES } from "@/lib/fixtures";
import { quantitiesInStepText } from "@/lib/recipe/consistency";

const steps = (...texts: string[]) => ({ steps: texts.map((text, i) => ({ id: `s${i + 1}`, text })) }) as never;

describe("quantitiesInStepText", () => {
  it.each(FIXTURE_RECIPES.map((r) => [r.id, r]))("saved recipe %s keeps amounts out of step text", (_id, recipe) => {
    expect(quantitiesInStepText(recipe)).toEqual([]);
  });

  it("flags amounts written into instructions", () => {
    expect(quantitiesInStepText(steps("Add 2 cups of broth and ½ tsp salt.", "Stir in 150g pasta.", "Melt 1 stick butter."))).toEqual([
      { stepId: "s1", matches: ["2 cups", "½ tsp"] },
      { stepId: "s2", matches: ["150g"] },
      { stepId: "s3", matches: ["1 stick"] },
    ]);
  });

  it("allows times, temperatures and counts that aren't amounts", () => {
    expect(quantitiesInStepText(steps("Air fry at 390°F for 10–12 minutes.", "Simmer 25 to 30 minutes.", "Cut into 4 pieces.", "Bake at 200 °C."))).toEqual([]);
  });
});
