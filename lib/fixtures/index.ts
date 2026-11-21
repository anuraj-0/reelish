import type { Recipe } from "@/lib/recipe/schema";
import { kajuKatliYoutube } from "./kaju-katli-youtube";
import { pastaSaladInstagram } from "./pasta-salad-instagram";
import { soupYoutube } from "./soup-youtube";
import { turkeyInstagram } from "./turkey-instagram";

/** Saved test recipes from the feasibility spike. Used until the live pipeline lands (M2/M3). */
export const FIXTURE_RECIPES: readonly Recipe[] = [soupYoutube, pastaSaladInstagram, turkeyInstagram, kajuKatliYoutube];

export function getFixtureRecipe(id: string): Recipe | undefined {
  return FIXTURE_RECIPES.find((r) => r.id === id);
}

export function findFixtureByKey(key: string): Recipe | undefined {
  return FIXTURE_RECIPES.find((r) => `${r.source.platform}:${r.source.videoId}` === key);
}
