"use client";

import { Plus } from "lucide-react";
import type { ViewIngredient } from "@/lib/recipe/edits";
import { LABEL_TEXT } from "@/lib/recipe/labels";
import { cn } from "@/lib/utils";

/**
 * Shows an ingredient's amount with its label, and opens the editor.
 * Accessible name: one sentence ("Onion: 1, Confirmed from creator. Edit amount") that
 * contains the visible text, so both screen readers and voice control ("tap 1") work.
 */
export function QuantityButton({ ingredient, onEdit, size = "md" }: { ingredient: ViewIngredient; onEdit: () => void; size?: "md" | "lg" }) {
  const q = ingredient.displayQuantity;

  if (!q) {
    return (
      <button
        type="button"
        onClick={onEdit}
        className={cn(
          "inline-flex shrink-0 items-center gap-1 rounded-full border border-dashed border-missing/40 bg-missing-bg font-medium text-missing outline-none hover:border-missing/70 focus-visible:ring-3 focus-visible:ring-ring/50",
          size === "lg" ? "h-11 px-4 text-base" : "h-9 px-3 text-sm",
        )}
      >
        <Plus className="size-4" aria-hidden />
        <span aria-hidden>Not specified</span>
        <span className="sr-only">{`${ingredient.name}: Not specified. Add amount`}</span>
      </button>
    );
  }

  const tag = ingredient.label === "suggested" || ingredient.label === "edited" ? LABEL_TEXT[ingredient.label] : null;
  return (
    <button
      type="button"
      onClick={onEdit}
      className={cn(
        "-my-1 flex shrink-0 flex-col items-end rounded-lg px-2 py-1 text-right outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50",
        size === "lg" ? "min-h-11" : "min-h-9",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "font-semibold tabular-nums",
          size === "lg" ? "text-lg" : "text-base",
          ingredient.label === "suggested" && "underline decoration-suggested/50 decoration-dotted underline-offset-4",
        )}
      >
        {q.raw}
      </span>
      {tag ? (
        <span aria-hidden className={cn("text-xs font-medium", ingredient.label === "edited" ? "text-primary" : "text-suggested")}>
          {tag}
        </span>
      ) : null}
      <span className="sr-only">{`${ingredient.name}: ${q.raw}, ${LABEL_TEXT[ingredient.label]}. Edit amount`}</span>
    </button>
  );
}
