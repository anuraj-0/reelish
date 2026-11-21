import { stripQuantities, quantitiesInStepText } from "@/lib/recipe/consistency";
import { parseQuantity } from "@/lib/recipe/quantity";
import { Recipe, type Evidence, type Ingredient, type QuantityStatus, type SourceKind, type Step } from "@/lib/recipe/schema";
import { parseDurationText, parseTemperatureText, parseTimestamp } from "@/lib/recipe/time";
import { PipelineError } from "./errors";
import type { LlmRecipe, LlmSource } from "./prompt";

/**
 * Model output → our Recipe, plus the provenance guard (deterministic, after the AI call):
 * - evidence citing a source we never provided is removed;
 * - an amount claimed from the description or linked recipe must actually appear there,
 *   otherwise it's downgraded to "suggested";
 * - amounts the model inferred (model_estimate) are dropped: missing stays missing;
 * - amounts are stripped from step text; unknown ingredient references are dropped;
 * - timestamps outside the video or on steps not attributed to the video are dropped.
 * Video-sourced claims can't be checked automatically and are kept as stated.
 */

export type NormalizeInput = {
  recipeId: string;
  pipelineVersion: string;
  createdAt: string;
  stages: string[];
  video: { videoId: string; url: string; title: string; channelTitle: string; durationSec: number; thumbnailUrl: string | null };
  /** Exactly the text blocks given to the model; null when not provided. */
  description: string | null;
  linked: { url: string; text: string } | null;
};

export type NormalizeResult = { recipe: Recipe; warnings: string[] };

const VIDEO_SOURCES: ReadonlySet<LlmSource> = new Set(["video_speech", "video_on_screen_text", "video_visual"]);
const TEXT_SOURCES = ["description", "linked_recipe"] as const;
type TextSource = (typeof TEXT_SOURCES)[number];

const FRACTIONS: Record<string, string> = { "½": "1/2", "⅓": "1/3", "⅔": "2/3", "¼": "1/4", "¾": "3/4", "⅛": "1/8" };

/** Lowercase, unicode fractions spelled out, punctuation and whitespace collapsed. */
export function normalizeText(s: string): string {
  // Fractions first: NFKC would turn "½" into "1⁄2" (with a fraction slash).
  return s
    .replace(/[½⅓⅔¼¾⅛]/g, (c) => ` ${FRACTIONS[c]} `)
    .normalize("NFKC")
    .replace(/\u2044/g, "/")
    .toLowerCase()
    .replace(/[–—]/g, "-")
    .replace(/[^\p{L}\p{N}/.\-\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const numbersIn = (s: string): string[] => normalizeText(s).match(/\d+(?:[./]\d+)?/g) ?? [];
const nameWords = (name: string) =>
  normalizeText(name)
    .split(" ")
    .filter((w) => w.length >= 3)
    .map((w) => w.replace(/(es|s)$/, ""));

/**
 * Does this text source really give this amount for this ingredient? True when the model's
 * quote appears verbatim and contains the amount's numbers, or when one line mentions the
 * ingredient and contains the amount (all its numbers, or its wording for "to taste").
 */
export function quantityAppearsIn(text: string, quantity: string, ingredientName: string, quote: string | null): string | null {
  const nums = numbersIn(quantity);
  const qNorm = normalizeText(quantity);
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (quote) {
    const quoteNorm = normalizeText(quote);
    const line = lines.find((l) => normalizeText(l).includes(quoteNorm));
    if (line && quoteNorm && (nums.length ? nums.every((n) => numbersIn(quote).includes(n)) : quoteNorm.includes(qNorm))) return line.trim();
  }
  const words = nameWords(ingredientName);
  for (const line of lines) {
    const lineNorm = normalizeText(line);
    const lineNums = numbersIn(line);
    const mentions = words.some((w) => lineNorm.includes(w));
    if (!mentions) continue;
    if (nums.length ? nums.every((n) => lineNums.includes(n)) : lineNorm.includes(qNorm)) return line.trim();
  }
  return null;
}

const slug = (s: string) =>
  s
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40) || "item";

function cleanDoneCue(cue: string | null): string | null {
  if (!cue) return null;
  const c = cue.replace(/^(done\s+when|until|when)\s+/i, "").replace(/[.\s]+$/, "").trim();
  return c || null;
}

export function normalizeRecipe(llm: LlmRecipe, input: NormalizeInput): NormalizeResult {
  const warnings: string[] = [];
  if (!llm.is_recipe || (llm.ingredients.length === 0 && llm.steps.length === 0)) {
    throw new PipelineError("not_a_recipe", "model found no recipe in this video");
  }

  const texts: Record<TextSource, string | null> = {
    description: input.description?.trim() ? input.description : null,
    linked_recipe: input.linked?.text ?? null,
  };
  const available = (s: LlmSource) => VIDEO_SOURCES.has(s) || s === "model_estimate" || (s in texts && texts[s as TextSource] !== null);
  const evidence = (source: LlmSource, extra: Partial<Evidence> = {}): Evidence => ({
    source,
    ...(source === "linked_recipe" && input.linked ? { url: input.linked.url } : {}),
    ...extra,
    ...(extra.excerpt ? { excerpt: extra.excerpt.slice(0, 300) } : {}),
  });
  const keep = (sources: LlmSource[], what: string): LlmSource[] => {
    const kept = [...new Set(sources)].filter(available);
    if (kept.length < new Set(sources).size) warnings.push(`removed unavailable source(s) from ${what}`);
    return kept;
  };

  // ---- Ingredients ----
  const idMap = new Map<string, string>();
  const used = new Set<string>();
  const ingredients: Ingredient[] = llm.ingredients.map((ing) => {
    let id = slug(ing.name);
    for (let n = 2; used.has(id); n++) id = `${slug(ing.name)}-${n}`;
    used.add(id);
    if (!idMap.has(ing.id)) idMap.set(ing.id, id);

    const nameSources = keep(ing.sources, `ingredient "${ing.name}"`);
    let status: QuantityStatus = "missing";
    let quantityEvidence: Evidence | null = null;
    const qty = ing.quantity;

    if (qty) {
      const claimed = ing.quantity_source;
      // Text claims are checked against the text itself; we also look in the other text source.
      const textOrder: TextSource[] =
        claimed === "description" || claimed === "linked_recipe" ? [claimed, ...TEXT_SOURCES.filter((t) => t !== claimed)] : [...TEXT_SOURCES];
      const verify = () => {
        for (const t of textOrder) {
          const body = texts[t];
          const line = body ? quantityAppearsIn(body, qty, ing.name, ing.quantity_quote) : null;
          if (line) return { source: t, line };
        }
        return null;
      };

      if (claimed === "description" || claimed === "linked_recipe") {
        const found = verify();
        if (found) {
          status = "stated";
          quantityEvidence = evidence(found.source, { excerpt: found.line });
          if (found.source !== claimed) warnings.push(`"${ing.name}" amount found in ${found.source}, not ${claimed}`);
        } else {
          status = "suggested";
          quantityEvidence = evidence("model_estimate");
          warnings.push(`"${ing.name}" amount "${qty}" not found in ${claimed}; downgraded to suggested`);
        }
      } else if (claimed && VIDEO_SOURCES.has(claimed)) {
        status = claimed === "video_visual" ? "suggested" : "stated";
        quantityEvidence = evidence(claimed);
      } else {
        // No source, or the model's own estimate: only keep it if a creator text really says it.
        const found = verify();
        if (found) {
          status = "stated";
          quantityEvidence = evidence(found.source, { excerpt: found.line });
        } else {
          warnings.push(`dropped unsupported amount "${qty}" for "${ing.name}"`);
        }
      }
    }

    const ev: Evidence[] = [];
    if (quantityEvidence) ev.push(quantityEvidence);
    for (const s of nameSources) if (!ev.some((e) => e.source === s)) ev.push(evidence(s));
    if (!ev.length) ev.push(evidence("model_estimate"));

    return {
      id,
      name: ing.name.slice(0, 120),
      group: ing.group?.slice(0, 60) ?? null,
      quantity: status === "missing" ? null : parseQuantity(qty!),
      quantityStatus: status,
      preparation: ing.preparation?.slice(0, 120) ?? null,
      optional: ing.optional,
      evidence: ev,
    };
  });

  // ---- Steps ----
  const steps: Step[] = llm.steps.map((step, i) => {
    let text = step.text;
    if (quantitiesInStepText({ steps: [{ text } as Step] }).length) {
      text = stripQuantities(text);
      warnings.push(`removed amounts from step ${i + 1} text`);
    }
    const sources = keep(step.sources, `step ${i + 1}`);
    const fromVideo = sources.some((s) => VIDEO_SOURCES.has(s));
    let ts = parseTimestamp(step.video_timestamp);
    if (ts !== null && (!fromVideo || ts > input.video.durationSec)) {
      warnings.push(`dropped timestamp ${String(step.video_timestamp)} on step ${i + 1}`);
      ts = null;
    }
    const ev = sources.map((s) => {
      const extra: Partial<Evidence> = {};
      if (VIDEO_SOURCES.has(s) && ts !== null) extra.videoTimestampSec = ts;
      const body = s === "description" || s === "linked_recipe" ? texts[s] : null;
      if (body && step.quote && normalizeText(body).includes(normalizeText(step.quote))) extra.excerpt = step.quote;
      return evidence(s, extra);
    });
    if (!ev.length) ev.push(evidence("model_estimate"));

    const ingredientIds = [...new Set(step.ingredient_ids.map((ref) => idMap.get(ref)).filter((x): x is string => Boolean(x)))];
    if (ingredientIds.length < step.ingredient_ids.length) warnings.push(`dropped unknown ingredient reference(s) in step ${i + 1}`);
    const duration = step.duration ? { raw: step.duration, ...parseDurationText(step.duration) } : null;
    const temperature = step.temperature ? { raw: step.temperature, ...parseTemperatureText(step.temperature) } : null;

    return {
      id: `s${i + 1}`,
      text: text || step.text,
      ingredientIds,
      duration,
      temperature,
      heat: step.heat,
      doneCue: cleanDoneCue(step.done_cue),
      videoTimestampSec: ts,
      evidence: ev,
    };
  });

  // ---- Servings, times, notes, conflicts, gaps ----
  const sourcedValue = (v: LlmRecipe["servings"], what: string) => {
    if (!v) return null;
    const sources = keep(v.sources, what).filter((s) => s !== "model_estimate");
    if (!sources.length) {
      warnings.push(`dropped unsupported ${what}`);
      return null;
    }
    return { raw: v.text.slice(0, 60), evidence: sources.map((s) => evidence(s)) };
  };
  const servings = sourcedValue(llm.servings, "servings");
  const time = (v: LlmRecipe["total_time"], what: string) => {
    const s = sourcedValue(v, what);
    return s ? { ...s, minutes: parseDurationText(s.raw).minMinutes } : null;
  };
  const notes = llm.notes
    .map((n) => ({ text: n.text.slice(0, 400), sources: keep(n.sources, "note").filter((s) => s !== "model_estimate") }))
    .filter((n) => n.sources.length)
    .map((n) => ({ text: n.text, evidence: n.sources.map((s) => evidence(s)) }));
  const conflicts = llm.conflicts
    .filter((c) => available(c.chosen_source))
    .map((c) => {
      const ingredientId = c.ingredient_id ? idMap.get(c.ingredient_id) : undefined;
      return {
        path: ingredientId ? `ingredients.${ingredientId}.quantity` : "recipe",
        description: c.description.slice(0, 300),
        chosen: c.chosen_source as SourceKind,
        alternatives: c.alternatives.filter((a) => available(a.source)).map((a) => ({ value: a.value.slice(0, 100), source: a.source as SourceKind })),
      };
    });
  const gaps = [...new Set(llm.gaps.map((g) => g.trim()).filter(Boolean))].slice(0, 12).map((g) => g.slice(0, 200));
  if (!steps.length) gaps.unshift("The video doesn't show the cooking steps.");

  const complete = steps.length > 0 && ingredients.filter((i) => !i.optional).every((i) => i.quantityStatus !== "missing");
  const firstNumber = servings?.raw.match(/\d+/)?.[0];

  const recipe = Recipe.parse({
    id: input.recipeId,
    schemaVersion: 1,
    source: {
      platform: "youtube",
      videoId: input.video.videoId,
      url: input.video.url,
      creator: { name: input.video.channelTitle || null, handle: null },
      videoTitle: input.video.title,
      thumbnailUrl: input.video.thumbnailUrl,
      linkedRecipeUrls: input.linked ? [input.linked.url] : [],
    },
    title: (llm.title.trim() || input.video.title).slice(0, 120),
    servings: servings ? { ...servings, value: firstNumber ? Number(firstNumber) : null } : null,
    prepTime: time(llm.prep_time, "prep time"),
    cookTime: time(llm.cook_time, "cook time"),
    totalTime: time(llm.total_time, "total time"),
    ingredients,
    steps,
    notes,
    conflicts,
    gaps,
    extraction: { status: complete ? "complete" : "partial", pipelineVersion: input.pipelineVersion, stages: input.stages, createdAt: input.createdAt },
  });

  if (quantitiesInStepText(recipe).length) throw new PipelineError("invalid_output", "amounts left in step text after cleanup");
  return { recipe, warnings };
}
