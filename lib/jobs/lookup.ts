import "server-only";
import { getDb } from "@/lib/db";
import { pipelineMode } from "@/lib/env";
import { findFixtureByKey, getFixtureRecipe } from "@/lib/fixtures";

/** Cheap existence check (no parsing), used by Proxy to return a real 404 before the page streams. */
export function recipeExists(id: string): boolean {
  if (getFixtureRecipe(id)) return true;
  if (pipelineMode() === "fixtures" || !/^(yt|ig)-[A-Za-z0-9_-]{5,60}$/.test(id)) return false;
  return Boolean(getDb().prepare("SELECT 1 FROM recipes WHERE id = ?").get(id));
}

/** True if some recipe came from this Instagram reel (saved example or made on this site). */
export function reelHasRecipe(shortcode: string): boolean {
  if (findFixtureByKey(`instagram:${shortcode}`)) return true;
  if (pipelineMode() === "fixtures") return false;
  return Boolean(getDb().prepare("SELECT 1 FROM recipes WHERE video_key = ? LIMIT 1").get(`instagram:${shortcode}`));
}
