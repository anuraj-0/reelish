"use client";

import { Plus } from "lucide-react";
import type { ViewIngredient } from "@/lib/recipe/edits";
import { LABEL_TEXT } from "@/lib/recipe/labels";
import { cn } from "@/lib/utils";

/**
 * Shows an ingredient's amount with its label, and opens the editor.
 * Accessible name: one sentence ("Onion: 1, From the creator. Edit amount") that
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
          // Missing is said once at the top of the recipe; each row just offers the action.
          "inline-flex min-h-11 shrink-0 items-center gap-1 border-2 border-dashed border-foreground/60 px-2.5 font-semibold sm:px-3 text-foreground outline-none hover:border-solid hover:border-foreground hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring focus-visible:ring-offset-2",
          size === "lg" ? "text-base" : "text-sm",
        )}
      >
        <Plus className="size-4" aria-hidden />
        {/* Very narrow phones: "Add" leaves room for the ingredient name. */}
        <span aria-hidden>
          Add<span className="hidden min-[380px]:inline"> amount</span>
        </span>
        <span className="sr-only">{`${ingredient.name}: ${LABEL_TEXT.not_specified}. Add amount`}</span>
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
        "min-h-11",
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
