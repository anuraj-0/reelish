import { z } from "zod";

/**
 * Internal provenance: where a fact came from. Detailed on purpose; the UI
 * collapses these into three labels (see labels.ts).
 */
export const SourceKind = z.enum([
  "video_speech", // said in the video
  "video_on_screen_text", // the creator's text overlay
  "video_visual", // seen in the video, e.g. a carton label or garnish
  "caption", // Instagram caption
  "description", // YouTube description
  "linked_recipe", // the creator's linked recipe page (JSON-LD)
  "model_estimate", // inferred by the model, not stated anywhere
]);
export type SourceKind = z.infer<typeof SourceKind>;

export const Evidence = z.object({
  source: SourceKind,
  /** Short supporting text, for text sources. */
  excerpt: z.string().max(300).optional(),
  videoTimestampSec: z.number().nonnegative().optional(),
  /** For linked_recipe evidence. */
  url: z.url().optional(),
});
export type Evidence = z.infer<typeof Evidence>;

export const Quantity = z.object({
  /** Exactly as stated or typed: "½–1 tbsp", "a drizzle", "to taste". */
  raw: z.string().trim().min(1),
  amount: z.number().positive().nullable(),
  /** Upper bound for ranges like "2–3". */
  amountMax: z.number().positive().nullable(),
  unit: z.string().nullable(),
});
export type Quantity = z.infer<typeof Quantity>;

/** stated = the creator said it; suggested = inferred; missing = nobody said. */
export const QuantityStatus = z.enum(["stated", "suggested", "missing"]);
export type QuantityStatus = z.infer<typeof QuantityStatus>;

export const Ingredient = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    /** Component heading, e.g. "Dressing". Null when the recipe has one group. */
    group: z.string().nullable(),
    quantity: Quantity.nullable(),
    quantityStatus: QuantityStatus,
    /** "finely diced", "softened". */
    preparation: z.string().nullable(),
    optional: z.boolean(),
    evidence: z.array(Evidence).min(1),
  })
  .refine((i) => (i.quantityStatus === "missing") === (i.quantity === null), {
    message: "quantity must be null exactly when quantityStatus is 'missing'",
    path: ["quantity"],
  });
export type Ingredient = z.infer<typeof Ingredient>;

export const TimeValue = z.object({
  raw: z.string().min(1),
  minutes: z.number().positive().nullable(),
  evidence: z.array(Evidence).min(1),
});
export type TimeValue = z.infer<typeof TimeValue>;

export const Step = z.object({
  id: z.string().min(1),
  /** Instruction without quantities; quantities come from ingredientIds so edits stay consistent. */
  text: z.string().min(1),
  ingredientIds: z.array(z.string()),
  duration: z
    .object({ raw: z.string(), minMinutes: z.number().positive().nullable(), maxMinutes: z.number().positive().nullable() })
    .nullable(),
  temperature: z
    .object({ raw: z.string(), value: z.number().nullable(), unit: z.enum(["C", "F"]).nullable() })
    .nullable(),
  heat: z.enum(["low", "medium-low", "medium", "medium-high", "high"]).nullable(),
  /** "until golden and crispy". */
  doneCue: z.string().nullable(),
  /** Only when the step is actually said or shown in the video. */
  videoTimestampSec: z.number().nonnegative().nullable(),
  evidence: z.array(Evidence).min(1),
});
export type Step = z.infer<typeof Step>;

export const Conflict = z.object({
  /** e.g. "ingredients.broth.quantity" */
  path: z.string(),
  description: z.string(),
  chosen: SourceKind,
  alternatives: z.array(z.object({ value: z.string(), source: SourceKind })),
});
export type Conflict = z.infer<typeof Conflict>;

export const Note = z.object({ text: z.string().min(1), evidence: z.array(Evidence).min(1) });
export type Note = z.infer<typeof Note>;

export const Platform = z.enum(["youtube", "instagram"]);
export type Platform = z.infer<typeof Platform>;

export const Recipe = z
  .object({
    id: z.string().min(1),
    schemaVersion: z.literal(1),
    source: z.object({
      platform: Platform,
      videoId: z.string().min(1),
      /** Canonical URL, rebuilt by us from the video id. */
      url: z.url(),
      creator: z.object({ name: z.string().nullable(), handle: z.string().nullable() }),
      videoTitle: z.string().nullable(),
      /** Only a real image from the platform; never generated. */
      thumbnailUrl: z.url().nullable(),
      linkedRecipeUrls: z.array(z.url()),
    }),
    title: z.string().min(1),
    servings: z.object({ raw: z.string(), value: z.number().positive().nullable(), evidence: z.array(Evidence).min(1) }).nullable(),
    prepTime: TimeValue.nullable(),
    cookTime: TimeValue.nullable(),
    totalTime: TimeValue.nullable(),
    ingredients: z.array(Ingredient),
    steps: z.array(Step),
    notes: z.array(Note),
    conflicts: z.array(Conflict),
    /** Things a cook needs that no source gives, e.g. "No oven temperature given". */
    gaps: z.array(z.string()),
    extraction: z.object({
      status: z.enum(["complete", "partial", "not_a_recipe"]),
      pipelineVersion: z.string(),
      stages: z.array(z.string()),
      createdAt: z.iso.datetime(),
    }),
  })
  .superRefine((r, ctx) => {
    const ids = new Set<string>();
    for (const [i, ing] of r.ingredients.entries()) {
      if (ids.has(ing.id)) ctx.addIssue({ code: "custom", message: `duplicate ingredient id ${ing.id}`, path: ["ingredients", i, "id"] });
      ids.add(ing.id);
    }
    const stepIds = new Set<string>();
    for (const [i, step] of r.steps.entries()) {
      if (stepIds.has(step.id)) ctx.addIssue({ code: "custom", message: `duplicate step id ${step.id}`, path: ["steps", i, "id"] });
      stepIds.add(step.id);
      for (const ref of step.ingredientIds) {
        if (!ids.has(ref)) ctx.addIssue({ code: "custom", message: `unknown ingredient id ${ref}`, path: ["steps", i, "ingredientIds"] });
      }
    }
  });
export type Recipe = z.infer<typeof Recipe>;
