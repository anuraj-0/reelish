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
          "brut-press inline-flex shrink-0 items-center gap-1 border-2 border-foreground bg-missing-bg font-semibold text-missing-ink outline-none hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring focus-visible:ring-offset-2",
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
        "-my-1 flex shrink-0 flex-col items-end border-2 border-transparent px-2 py-1 text-right outline-none hover:border-foreground hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring",
        size === "lg" ? "min-h-11" : "min-h-9",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "font-extrabold tabular-nums",
          size === "lg" ? "text-lg" : "text-base",
          ingredient.label === "suggested" && "underline decoration-suggested/50 decoration-dotted underline-offset-4",
        )}
      >
        {q.raw}
      </span>
      {tag ? (
        <span aria-hidden className={cn("label-mono text-[0.7rem]", ingredient.label === "edited" ? "text-foreground" : "text-suggested")}>
          {tag}
        </span>
      ) : null}
      <span className="sr-only">{`${ingredient.name}: ${q.raw}, ${LABEL_TEXT[ingredient.label]}. Edit amount`}</span>
    </button>
  );
}
