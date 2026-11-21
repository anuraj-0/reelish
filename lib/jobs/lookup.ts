import "server-only";
import { getDb } from "@/lib/db";
import { pipelineMode } from "@/lib/env";
import { getFixtureRecipe } from "@/lib/fixtures";

/** Cheap existence check (no parsing), used by Proxy to return a real 404 before the page streams. */
export function recipeExists(id: string): boolean {
  if (getFixtureRecipe(id)) return true;
  if (pipelineMode() === "fixtures" || !/^(yt|ig)-[A-Za-z0-9_-]{5,60}$/.test(id)) return false;
  return Boolean(getDb().prepare("SELECT 1 FROM recipes WHERE id = ?").get(id));
}
