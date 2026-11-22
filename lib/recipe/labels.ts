import type { Evidence, Ingredient, SourceKind } from "./schema";

/** What users see. Internal provenance stays detailed; this is the simple version. */
export type QuantityLabel = "confirmed" | "suggested" | "not_specified" | "edited";

const CREATOR_SOURCES: ReadonlySet<SourceKind> = new Set<SourceKind>([
  "video_speech",
  "video_on_screen_text",
  "caption",
  "description",
  "linked_recipe",
]);

export function isCreatorSource(source: SourceKind): boolean {
  return CREATOR_SOURCES.has(source);
}

export function hasCreatorEvidence(evidence: Evidence[]): boolean {
  return evidence.some((e) => isCreatorSource(e.source));
}

/** Label for an ingredient's quantity as extracted (before user edits). */
export function quantityLabel(ingredient: Pick<Ingredient, "quantityStatus" | "evidence">): Exclude<QuantityLabel, "edited"> {
  if (ingredient.quantityStatus === "missing") return "not_specified";
  if (ingredient.quantityStatus === "stated" && hasCreatorEvidence(ingredient.evidence)) return "confirmed";
  return "suggested";
}

export const LABEL_TEXT: Record<QuantityLabel, string> = {
  // "creator", not "video": confirmed amounts also come from captions, descriptions and linked recipes.
  confirmed: "From the creator",
  suggested: "Estimated",
  not_specified: "Not provided",
  edited: "Added by you",
};

/** Plain-language description of a source, for the "Sources" section. */
export const SOURCE_TEXT: Record<SourceKind, string> = {
  video_speech: "What's said in the video",
  video_on_screen_text: "Text shown in the video",
  video_visual: "What's visible in the video",
  caption: "The creator's caption",
  description: "The creator's video description",
  linked_recipe: "The creator's written recipe",
  model_estimate: "Estimated by Reelish",
};
