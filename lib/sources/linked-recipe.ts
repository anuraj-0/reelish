import "server-only";
import { cacheGet, cachePut, type Db } from "@/lib/db";
import { describeMinutes, parseIsoDuration } from "@/lib/recipe/time";
import { httpsTransport, robotsAllows, robotsRules, safeGet, SafeFetchError, type Transport } from "./safe-fetch";

/**
 * The creator's written recipe, when the description links one. JSON-LD only (decision D6):
 * we read the page's schema.org Recipe and never scrape the rest of the page.
 */

export type LinkedRecipe = {
  url: string;
  name: string;
  yield: string | null;
  prepTime: string | null;
  cookTime: string | null;
  totalTime: string | null;
  ingredients: string[];
  instructions: { section: string | null; text: string }[];
  /** The page embeds this exact video: strong evidence it's the same recipe. */
  embedsVideo: boolean;
};

export type LinkAttempt = { url: string; result: "found" | "no_recipe" | "irrelevant" | "robots_disallowed" | "fetch_failed"; detail?: string };
export type LinkedOutcome = { candidates: string[]; attempts: LinkAttempt[]; recipe: LinkedRecipe | null };

// ---- Finding candidate links ----------------------------------------------------------------

/** Never recipe pages: social, video, link-in-bio, shops, music, payments. Subdomains included. */
const DENY_HOSTS = [
  "youtube.com", "youtu.be", "instagram.com", "facebook.com", "fb.me", "fb.com", "tiktok.com", "twitter.com", "x.com", "t.co",
  "pinterest.com", "pin.it", "snapchat.com", "threads.net", "linkedin.com", "reddit.com", "discord.gg", "discord.com", "twitch.tv",
  "patreon.com", "linktr.ee", "beacons.ai", "lnk.to", "lnk.bio", "hoo.be", "stan.store", "tumblr.com", "spotify.com", "apple.com",
  "amazon.com", "amazon.co.uk", "amazon.ca", "amazon.in", "amazon.de", "amzn.to", "amzn.eu", "a.co", "geni.us", "etsy.com", "ebay.com",
  "walmart.com", "target.com", "shopmy.us", "liketoknow.it", "ltk.app", "gofundme.com", "paypal.com", "paypal.me", "venmo.com",
  "ko-fi.com", "buymeacoffee.com", "cash.app", "whatsapp.com", "wa.me", "telegram.me", "t.me",
];

export function isDeniedHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^www\./, "");
  return DENY_HOSTS.some((d) => h === d || h.endsWith(`.${d}`));
}

const URL_RE = /https?:\/\/[^\s<>"'`]+/gi;

/**
 * Up to `max` URLs from a description that probably lead to this video's written recipe.
 * Scores each link by the words on its line and the line before ("full printable recipe…").
 */
export function findRecipeLinks(description: string, max = 2): string[] {
  const lines = description.split(/\r?\n/);
  const scored: { url: string; score: number; order: number }[] = [];
  lines.forEach((line, i) => {
    for (const match of line.matchAll(URL_RE)) {
      const raw = match[0].replace(/[.,;:!?)\]}»"']+$/, "");
      let url: URL;
      try {
        url = new URL(raw);
      } catch {
        continue;
      }
      if (isDeniedHost(url.hostname)) continue;
      const context = `${lines[i - 1] ?? ""} ${line.replace(match[0], " ")}`.toLowerCase();
      let score = 0;
      if (/\brecipe\b/.test(context)) score += 3;
      else if (/\brecipes\b/.test(context)) score += 1;
      if (/printable|full recipe|written recipe|recipe here|get the recipe|find the recipe|recipe link|recipe:|recipe below|on my (blog|website)/.test(context)) score += 2;
      if (/\b(cook)?books?\b|\bshop\b|merch|subscribe|follow|nutrition|affiliate|discount|\bcode\b|sponsor|\bgear\b|equipment|knife|knives|playlist|newsletter/.test(context)) score -= 3;
      if (url.pathname === "/" || url.pathname === "") score -= 2;
      if (/recipe/.test(url.pathname.toLowerCase())) score += 1;
      if (score > 0) scored.push({ url: url.toString(), score, order: scored.length });
    }
  });
  const seen = new Set<string>();
  return scored
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .map((s) => s.url)
    .filter((u) => (seen.has(u) ? false : (seen.add(u), true)))
    .slice(0, max);
}

// ---- JSON-LD --------------------------------------------------------------------------------

const ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", frac12: "½", frac14: "¼", frac34: "¾", deg: "°",
  ndash: "–", mdash: "—", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", hellip: "…", eacute: "é", egrave: "è",
};

export function cleanText(value: string): string {
  return value
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => safeChar(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => safeChar(Number(d)))
    .replace(/&([a-z0-9]+);/gi, (m, name) => ENTITIES[name.toLowerCase()] ?? m)
    .replace(/\s+/g, " ")
    .trim();
}

function safeChar(code: number): string {
  try {
    return code > 0 && code < 0x110000 ? String.fromCodePoint(code) : "";
  } catch {
    return "";
  }
}

type Json = null | boolean | number | string | Json[] | { [k: string]: Json };

function isRecipeNode(node: Json): node is { [k: string]: Json } {
  if (!node || typeof node !== "object" || Array.isArray(node)) return false;
  const t = node["@type"];
  return t === "Recipe" || (Array.isArray(t) && t.includes("Recipe"));
}

/** All schema.org Recipe objects in a page's JSON-LD blocks (handles arrays, @graph, mainEntity). */
export function extractJsonLdRecipes(html: string): { [k: string]: Json }[] {
  const found: { [k: string]: Json }[] = [];
  const re = /<script\b[^>]*type\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script\s*>/gi;
  for (const m of html.matchAll(re)) {
    let data: Json;
    try {
      data = JSON.parse(m[1].trim().replace(/^<!\[CDATA\[|\]\]>$/g, ""));
    } catch {
      continue;
    }
    const stack: Json[] = [data];
    let guard = 0;
    while (stack.length && guard++ < 500) {
      const node = stack.pop()!;
      if (Array.isArray(node)) stack.push(...node);
      else if (node && typeof node === "object") {
        if (isRecipeNode(node)) found.push(node);
        for (const key of ["@graph", "mainEntity", "mainEntityOfPage"]) if (node[key] && typeof node[key] === "object") stack.push(node[key]);
      }
    }
  }
  return found;
}

const str = (v: Json | undefined): string | null => (typeof v === "string" ? cleanText(v) || null : typeof v === "number" ? String(v) : null);

function isoToText(v: Json | undefined): string | null {
  const s = str(v);
  if (!s) return null;
  const sec = parseIsoDuration(s);
  return sec ? describeMinutes(Math.round(sec / 60)) : null;
}

function instructionsOf(v: Json | undefined, section: string | null = null, depth = 0): { section: string | null; text: string }[] {
  if (v === undefined || v === null || depth > 4) return [];
  if (typeof v === "string") {
    return v
      .split(/<\/li>|<br\s*\/?>|\n+/i)
      .map(cleanText)
      .filter(Boolean)
      .map((text) => ({ section, text }));
  }
  if (Array.isArray(v)) return v.flatMap((item) => instructionsOf(item, section, depth + 1));
  if (typeof v === "object") {
    const type = v["@type"];
    if (type === "HowToSection" || (Array.isArray(type) && type.includes("HowToSection"))) {
      return instructionsOf(v.itemListElement, str(v.name) ?? section, depth + 1);
    }
    const text = str(v.text) ?? str(v.name);
    if (text) return [{ section, text }];
    return instructionsOf(v.itemListElement, section, depth + 1);
  }
  return [];
}

export function toLinkedRecipe(node: { [k: string]: Json }, pageUrl: string, html: string, videoId: string): LinkedRecipe {
  const yieldValue = Array.isArray(node.recipeYield) ? node.recipeYield.map((y) => str(y)).filter(Boolean).join(" / ") : str(node.recipeYield);
  const ingredients = (Array.isArray(node.recipeIngredient) ? node.recipeIngredient : Array.isArray(node.ingredients) ? node.ingredients : [])
    .map((i) => str(i))
    .filter((i): i is string => Boolean(i))
    .slice(0, 80);
  return {
    url: pageUrl,
    name: str(node.name) ?? "Recipe",
    yield: yieldValue || null,
    prepTime: isoToText(node.prepTime),
    cookTime: isoToText(node.cookTime),
    totalTime: isoToText(node.totalTime),
    ingredients,
    instructions: instructionsOf(node.recipeInstructions).slice(0, 60),
    embedsVideo: html.includes(videoId),
  };
}

const STOP = new Set(["recipe", "recipes", "easy", "best", "with", "homemade", "the", "and", "how", "make", "quick", "simple", "ever", "your", "this", "that", "from", "real"]);

const words = (s: string) =>
  new Set(
    s
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length >= 4 && !STOP.has(w))
      .map((w) => w.replace(/(es|s)$/, "")),
  );

/** Same dish? The page embeds the video, or the recipe's name shares a real word with the video's title. */
export function isRelevant(recipe: LinkedRecipe, video: { title: string; description: string }): boolean {
  if (recipe.embedsVideo) return true;
  const titleWords = words(`${video.title} ${video.description.slice(0, 400)}`);
  return [...words(recipe.name)].some((w) => titleWords.has(w));
}

export function isUsable(recipe: LinkedRecipe): boolean {
  return recipe.ingredients.length >= 3 && recipe.instructions.length >= 1;
}

/** The text block given to the model, labelled as data. */
export function renderLinkedRecipe(r: LinkedRecipe): string {
  const lines = [
    `URL: ${r.url}`,
    `This page embeds the video: ${r.embedsVideo ? "yes" : "no"}`,
    `Title: ${r.name}`,
    r.yield ? `Servings: ${r.yield}` : null,
    r.prepTime ? `Prep time: ${r.prepTime}` : null,
    r.cookTime ? `Cook time: ${r.cookTime}` : null,
    r.totalTime ? `Total time: ${r.totalTime}` : null,
    "Ingredients:",
    ...r.ingredients.map((i) => `- ${i.slice(0, 300)}`),
    "Instructions:",
  ].filter((l): l is string => l !== null);
  let section: string | null = null;
  r.instructions.forEach((step, i) => {
    if (step.section && step.section !== section) lines.push(`[${(section = step.section)}]`);
    lines.push(`${i + 1}. ${step.text.slice(0, 600)}`);
  });
  return lines.join("\n").slice(0, 12_000);
}

// ---- Fetching (robots.txt, cache) -----------------------------------------------------------

const PAGE_MAX_BYTES = 2_000_000;
const PAGE_TIMEOUT_MS = 8_000;
const DAY_MS = 86_400_000;

type RobotsCache = { rules: { allow: boolean; path: string }[] } | { unreachable: true };

async function robotsFor(origin: string, db: Db, transport: Transport, signal?: AbortSignal): Promise<RobotsCache> {
  const key = `robots:${origin}`;
  const hit = cacheGet<RobotsCache>(db, key, DAY_MS);
  if (hit) return hit;
  let value: RobotsCache;
  try {
    const res = await safeGet(`${origin}/robots.txt`, { accept: "text/plain", maxBytes: 256_000, timeoutMs: 5_000, signal }, transport);
    value = { rules: robotsRules(res.body) };
  } catch (e) {
    // No robots.txt (4xx) means no restrictions. A server error or timeout: assume we may not.
    value = e instanceof SafeFetchError && e.kind === "http_error" && e.status! >= 400 && e.status! < 500 ? { rules: [] } : { unreachable: true };
  }
  cachePut(db, key, value);
  return value;
}

/** Checks robots.txt for every hop, including the targets of shortener redirects. */
export function robotsAwareTransport(db: Db, base: Transport, signal?: AbortSignal): Transport {
  return async (url, opts) => {
    if (url.pathname !== "/robots.txt") {
      const robots = await robotsFor(url.origin, db, base, signal);
      if ("unreachable" in robots) throw new SafeFetchError("robots_disallowed", `robots.txt unreachable at ${url.origin}; not fetching`);
      if (!robotsAllows(robots.rules, url.pathname + url.search)) throw new SafeFetchError("robots_disallowed", `robots.txt disallows ${url.origin}${url.pathname}`);
    }
    return base(url, opts);
  };
}

type PageCache = { recipe: LinkedRecipe | null; result: LinkAttempt["result"]; detail?: string };

export async function fetchLinkedRecipe(
  video: { videoId: string; title: string; description: string },
  deps: { db: Db; transport?: Transport; signal?: AbortSignal },
): Promise<LinkedOutcome> {
  const candidates = findRecipeLinks(video.description);
  const attempts: LinkAttempt[] = [];
  const transport = robotsAwareTransport(deps.db, deps.transport ?? httpsTransport, deps.signal);
  for (const url of candidates) {
    const key = `page:${video.videoId}:${url}`;
    let page = cacheGet<PageCache>(deps.db, key, DAY_MS);
    if (!page) {
      try {
        const signal = deps.signal ? AbortSignal.any([deps.signal, AbortSignal.timeout(PAGE_TIMEOUT_MS)]) : AbortSignal.timeout(PAGE_TIMEOUT_MS);
        const res = await safeGet(url, { accept: "text/html", maxBytes: PAGE_MAX_BYTES, timeoutMs: PAGE_TIMEOUT_MS, signal }, transport);
        const nodes = extractJsonLdRecipes(res.body).map((n) => toLinkedRecipe(n, res.url, res.body, video.videoId));
        const usable = nodes.filter(isUsable);
        const recipe = usable.find((r) => isRelevant(r, video)) ?? null;
        page = recipe ? { recipe, result: "found" } : { recipe: null, result: usable.length ? "irrelevant" : "no_recipe", detail: usable[0]?.name };
      } catch (e) {
        if (deps.signal?.aborted) throw e;
        const robots = e instanceof SafeFetchError && e.kind === "robots_disallowed";
        page = { recipe: null, result: robots ? "robots_disallowed" : "fetch_failed", detail: e instanceof SafeFetchError ? `${e.kind}: ${e.message}` : String(e) };
      }
      // Transient failures aren't cached, so a retry tries again.
      if (page.result !== "fetch_failed") cachePut(deps.db, key, page);
    }
    attempts.push({ url, result: page.result, detail: page.detail });
    if (page.recipe) return { candidates, attempts, recipe: page.recipe };
  }
  return { candidates, attempts, recipe: null };
}
