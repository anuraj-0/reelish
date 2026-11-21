import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openDb, type Db } from "@/lib/db";
import { cleanText, extractJsonLdRecipes, fetchLinkedRecipe, findRecipeLinks, isRelevant, renderLinkedRecipe, toLinkedRecipe } from "@/lib/sources/linked-recipe";
import type { Transport } from "@/lib/sources/safe-fetch";
import { CARBONARA_DESCRIPTION, KAJU_DESCRIPTION, recipePage, SOUP_DESCRIPTION } from "./fixtures/youtube";

describe("findRecipeLinks", () => {
  it("finds the soup's recipe link on the line after 'full printable recipe'", () => {
    expect(findRecipeLinks(SOUP_DESCRIPTION)).toEqual(["https://www.themodernnonna.com/healthiest-cream-of-hidden-veggie-soup/"]);
  });

  it("picks 'Recipe here' and ignores the book, nutrition, social and homepage links", () => {
    expect(findRecipeLinks(CARBONARA_DESCRIPTION)).toEqual(["http://goo.gl/QuRCzK"]);
  });

  it("ignores links to other social posts", () => {
    expect(findRecipeLinks(KAJU_DESCRIPTION)).toEqual([]);
  });

  it("returns at most two links", () => {
    const d = "Full recipe: https://a.example/soup\nRecipe: https://b.example/soup\nRecipe here https://c.example/soup";
    expect(findRecipeLinks(d)).toHaveLength(2);
  });
});

describe("JSON-LD", () => {
  it("reads a Recipe from @graph, ignoring other blocks, and decodes entities", () => {
    const html = recipePage({ name: "Healthiest Cream of Hidden Veggie Soup", embedVideoId: "VTR8vxBFGDY" });
    const nodes = extractJsonLdRecipes(html);
    expect(nodes).toHaveLength(1);
    const r = toLinkedRecipe(nodes[0], "https://www.themodernnonna.com/x/", html, "VTR8vxBFGDY");
    expect(r.yield).toBe("3 / 3 servings");
    expect(r.totalTime).toBe("40 minutes");
    expect(r.ingredients[0]).toBe("2 tablespoons olive oil");
    expect(r.instructions[1].text).toBe("Add the carrots, celery, garlic and sauté for a few minutes.");
    expect(r.embedsVideo).toBe(true);
  });

  it("flattens HowToSection groups and keeps their names", () => {
    const html = recipePage({ name: "Soup", sections: true });
    const r = toLinkedRecipe(extractJsonLdRecipes(html)[0], "https://a.example/", html, "zzz");
    expect(r.instructions).toHaveLength(3);
    expect(r.instructions[0].section).toBe("Soup");
    expect(renderLinkedRecipe(r)).toContain("[Soup]\n1. In a big pot");
  });

  it("handles string instructions with HTML and broken JSON blocks", () => {
    const html = `<script type="application/ld+json">{broken</script><script type='application/ld+json'>[{"@type":["Recipe"],"name":"Pasta","recipeIngredient":["a","b","c"],"recipeInstructions":"<ol><li>Boil water.</li><li>Cook &amp; drain.</li></ol>"}]</script>`;
    const r = toLinkedRecipe(extractJsonLdRecipes(html)[0], "https://a.example/", html, "id");
    expect(r.instructions.map((i) => i.text)).toEqual(["Boil water.", "Cook & drain."]);
  });

  it("cleans HTML and numeric entities", () => {
    expect(cleanText("1&#x2F;2 cup &frac12; <b>sugar</b>&nbsp;&#8211; fine")).toBe("1/2 cup ½ sugar – fine");
  });

  it("judges relevance by embedded video or a shared word in the title", () => {
    const base = { url: "u", yield: null, prepTime: null, cookTime: null, totalTime: null, ingredients: [], instructions: [] };
    const video = { title: "Real Spaghetti Carbonara | Antonio Carluccio", description: "" };
    expect(isRelevant({ ...base, name: "Antonio Carluccio's spaghetti carbonara", embedsVideo: false }, video)).toBe(true);
    expect(isRelevant({ ...base, name: "Perfect Spaghetti Bolognese", embedsVideo: false }, { title: "Classic carbonara", description: "" })).toBe(false);
    expect(isRelevant({ ...base, name: "Anything", embedsVideo: true }, video)).toBe(true);
  });
});

describe("fetchLinkedRecipe", () => {
  let db: Db;
  beforeEach(() => {
    db = openDb(":memory:");
  });
  afterEach(() => db.close());

  const video = { videoId: "VTR8vxBFGDY", title: "Mom & Dad taught me how to make the HEALTHIEST creamy soups", description: SOUP_DESCRIPTION };
  const page = "https://www.themodernnonna.com/healthiest-cream-of-hidden-veggie-soup/";

  function transport(routes: Record<string, { status: number; type?: string; body?: string; location?: string }>) {
    const calls: string[] = [];
    const t: Transport = async (url) => {
      calls.push(url.toString());
      const r = routes[url.toString()];
      if (!r) return { status: 404, headers: { "content-type": "text/html" }, body: "", truncated: false };
      return { status: r.status, headers: { "content-type": r.type ?? "text/html", ...(r.location ? { location: r.location } : {}) }, body: r.body ?? "", truncated: false };
    };
    return { t, calls };
  }

  it("follows a redirect, checks robots.txt for each host and caches the result", async () => {
    const { t, calls } = transport({
      "https://www.themodernnonna.com/robots.txt": { status: 200, type: "text/plain", body: "User-agent: *\nDisallow: /wp-admin/" },
      [page]: { status: 301, location: "https://themodernnonna.com/creamy-vegetable-soup/" },
      "https://themodernnonna.com/robots.txt": { status: 404 },
      "https://themodernnonna.com/creamy-vegetable-soup/": { status: 200, body: recipePage({ name: "Creamy Vegetable Soup", embedVideoId: "VTR8vxBFGDY" }) },
    });
    const out = await fetchLinkedRecipe(video, { db, transport: t });
    expect(out.recipe?.url).toBe("https://themodernnonna.com/creamy-vegetable-soup/");
    expect(out.recipe?.embedsVideo).toBe(true);
    expect(calls).toContain("https://themodernnonna.com/robots.txt");

    const again = await fetchLinkedRecipe(video, { db, transport: t });
    expect(again.recipe?.name).toBe("Creamy Vegetable Soup");
    expect(calls.filter((c) => c === "https://themodernnonna.com/creamy-vegetable-soup/")).toHaveLength(1);
  });

  it("respects a robots.txt that disallows us", async () => {
    const { t, calls } = transport({ "https://www.themodernnonna.com/robots.txt": { status: 200, type: "text/plain", body: "User-agent: ReelishBot\nDisallow: /" } });
    const out = await fetchLinkedRecipe(video, { db, transport: t });
    expect(out.recipe).toBeNull();
    expect(out.attempts[0].result).toBe("robots_disallowed");
    expect(calls).not.toContain(page);
  });

  it("treats an unreachable robots.txt as 'not permitted'", async () => {
    const { t } = transport({ "https://www.themodernnonna.com/robots.txt": { status: 503, type: "text/plain" } });
    const out = await fetchLinkedRecipe(video, { db, transport: t });
    expect(out.attempts[0].result).toBe("robots_disallowed");
  });

  it("reports pages without a usable or relevant recipe", async () => {
    const { t } = transport({
      "https://www.themodernnonna.com/robots.txt": { status: 404 },
      [page]: { status: 200, body: recipePage({ name: "Chocolate Lava Cake" }) },
    });
    const out = await fetchLinkedRecipe(video, { db, transport: t });
    expect(out.recipe).toBeNull();
    expect(out.attempts[0]).toMatchObject({ result: "irrelevant", detail: "Chocolate Lava Cake" });
  });

  it("doesn't cache transient failures", async () => {
    let n = 0;
    const t: Transport = async (url) => {
      if (url.pathname === "/robots.txt") return { status: 404, headers: {}, body: "", truncated: false };
      n++;
      throw new Error("ECONNRESET");
    };
    await fetchLinkedRecipe(video, { db, transport: t });
    await fetchLinkedRecipe(video, { db, transport: t });
    expect(n).toBe(2);
  });
});
