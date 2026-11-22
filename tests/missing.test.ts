import { describe, expect, it } from "vitest";
import { kajuKatliYoutube } from "@/lib/fixtures/kaju-katli-youtube";
import { pastaSaladInstagram } from "@/lib/fixtures/pasta-salad-instagram";
import { soupYoutube } from "@/lib/fixtures/soup-youtube";
import { turkeyInstagram } from "@/lib/fixtures/turkey-instagram";
import { applyEdits, EMPTY_EDITS, setQuantity } from "@/lib/recipe/edits";
import { missingNotice } from "@/lib/recipe/missing";
import { parseQuantity } from "@/lib/recipe/quantity";

describe("missingNotice", () => {
  it("is null for a complete recipe with no gaps", () => {
    expect(missingNotice(applyEdits(soupYoutube, EMPTY_EDITS))).toBeNull();
  });

  it("says 'ingredient amounts' when no required ingredient has one, and keeps the other gaps", () => {
    const notice = missingNotice(applyEdits(kajuKatliYoutube, EMPTY_EDITS));
    expect(notice?.headline).toBe("This video doesn't include ingredient amounts.");
    // The amount gap is summarised by the headline; the rest are kept word for word.
    expect(notice?.details).toEqual(["No cooking times or heat levels are given.", "Number of servings isn't given."]);
  });

  it("counts only the amounts still missing after the user's own additions", () => {
    const view = applyEdits(turkeyInstagram, EMPTY_EDITS);
    expect(missingNotice(view)?.headline).toBe("This video doesn't include amounts for 6 ingredients.");
    const edited = applyEdits(turkeyInstagram, setQuantity(EMPTY_EDITS, "butter-rub", parseQuantity("1 stick")!));
    expect(missingNotice(edited)?.headline).toBe("This video doesn't include amounts for 5 ingredients.");
    expect(missingNotice(edited)?.details).toContain("No oven temperature is given.");
  });

  it("still surfaces gaps when every amount is given", () => {
    expect(missingNotice(applyEdits(pastaSaladInstagram, EMPTY_EDITS))).toEqual({
      headline: "A few details aren't in this video.",
      details: ["Number of servings isn't given."],
    });
  });
});
