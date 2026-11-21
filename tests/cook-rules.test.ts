import { describe, expect, it } from "vitest";
import { namedIn, splitStepIngredients } from "@/lib/recipe/cook";
import { doneCueText } from "@/lib/recipe/cues";
import { applyEdits, EMPTY_EDITS, setQuantity } from "@/lib/recipe/edits";
import { isAmbiguousQuantity, parseQuantity } from "@/lib/recipe/quantity";
import type { Recipe } from "@/lib/recipe/schema";
import { isRepeatInterval } from "@/lib/recipe/time";
import { soupYoutube } from "@/lib/fixtures/soup-youtube";

describe("ambiguous quantities", () => {
  it.each(["1 5kg", "2 14 oz cans", "1 400g can", "3 2-inch pieces"])("%s is a count followed by a size: ambiguous", (raw) => {
    expect(isAmbiguousQuantity(raw)).toBe(true);
    expect(parseQuantity(raw)).toEqual({ raw, amount: null, amountMax: null, unit: null });
  });
  it.each(["1 1/2 cups", "1 ½ cups", "2", "150g", "2 cups (½ head)", "1/2-1 tbsp", "12 oz", "to taste"])("%s is not ambiguous", (raw) => {
    expect(isAmbiguousQuantity(raw)).toBe(false);
  });
  it("still parses ordinary amounts", () => {
    expect(parseQuantity("1 1/2 cups")).toMatchObject({ amount: 1.5, unit: "cups" });
  });
});

describe("done-when cues", () => {
  it.each([
    ["get golden", "Done when it gets golden"],
    ["come to room temp", "Done when it comes to room temp"],
    ["thicken", "Done when it thickens"],
    ["reading of 180F in the breast", "Done at a reading of 180F in the breast"],
    ["an internal temperature of 165F", "Done at an internal temperature of 165F"],
    ["the butter is soft", "Done when the butter is soft"],
    ["golden and crispy", "Done when golden and crispy"],
    ["brown and crispy", "Done when brown and crispy"],
    ["cool enough to handle", "Done when cool enough to handle"],
    ["smooth", "Done when smooth"],
  ])("%s → %s", (cue, text) => expect(doneCueText(cue)).toBe(text));
});

describe("repeat intervals", () => {
  it.each(["every 40 minutes", "Every 10 min", "each 5 minutes", "baste every few minutes"])("%s is a repeat", (t) => expect(isRepeatInterval(t)).toBe(true));
  it.each(["40 minutes", "25-30 minutes", "at least one hour", "minimum of 30 minutes", "a few minutes"])("%s is a duration", (t) => expect(isRepeatInterval(t)).toBe(false));
});

describe("namedIn", () => {
  it("matches the ingredient's main word, singular or plural, ignoring generic adjectives", () => {
    expect(namedIn("Crack the eggs into a bowl", "Egg yolk")).toBe(true);
    expect(namedIn("Add the tomato", "Cherry tomatoes")).toBe(true);
    expect(namedIn("Massage with the seasoned butter", "Unsalted butter")).toBe(true);
    expect(namedIn("Add the dressing", "Plain yogurt")).toBe(false);
    expect(namedIn("Stir in the grated cheese", "Freshly grated parmesan")).toBe(false);
  });
});

describe("Cook Mode: ingredients for this step vs already added", () => {
  const recipe = (steps: [string, string[]][]): Recipe => ({
    ...soupYoutube,
    ingredients: ["butter", "flour", "milk", "salt"].map((id) => ({ id, name: id[0].toUpperCase() + id.slice(1), group: null, quantity: parseQuantity("1 cup"), quantityStatus: "stated" as const, preparation: null, optional: false, evidence: [{ source: "description" as const }] })),
    steps: steps.map(([text, ingredientIds], i) => ({ id: `s${i}`, text, ingredientIds, duration: null, temperature: null, heat: null, doneCue: null, videoTimestampSec: null, evidence: [{ source: "description" as const }] })),
  });
  const ids = (xs: { id: string }[]) => xs.map((x) => x.id);

  it("tucks away earlier ingredients the step doesn't name, and keeps reused ones it does", () => {
    const view = applyEdits(
      recipe([
        ["Melt half the butter and whisk in the flour", ["butter", "flour"]],
        ["Add the milk", ["milk"]],
        ["Stir until thick, then add the rest of the butter", ["butter", "flour", "milk", "salt"]],
      ]),
      EMPTY_EDITS,
    );
    expect(ids(splitStepIngredients(view.steps, 0).now)).toEqual(["butter", "flour"]);
    const last = splitStepIngredients(view.steps, 2);
    expect(ids(last.now)).toEqual(["butter", "salt"]); // butter is named (still needed); salt is new
    expect(ids(last.earlier)).toEqual(["flour", "milk"]);
  });

  it("never loses an ingredient, and keeps the user's edited amount in both lists", () => {
    const base = recipe([
      ["Melt the butter", ["butter"]],
      ["Whisk everything", ["butter", "flour"]],
    ]);
    const view = applyEdits(base, setQuantity(EMPTY_EDITS, "butter", parseQuantity("2 tbsp")!));
    const { now, earlier } = splitStepIngredients(view.steps, 1);
    expect([...now, ...earlier].map((i) => i.id).sort()).toEqual(["butter", "flour"]);
    expect(earlier.find((i) => i.id === "butter")?.displayQuantity?.raw).toBe("2 tbsp");
  });
});
