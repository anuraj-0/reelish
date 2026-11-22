"use client";

import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { ViewIngredient } from "@/lib/recipe/edits";
import { LABEL_TEXT } from "@/lib/recipe/labels";
import { parseQuantity } from "@/lib/recipe/quantity";
import type { Quantity } from "@/lib/recipe/schema";

type Props = {
  ingredient: ViewIngredient | null;
  onOpenChange: (open: boolean) => void;
  onSave: (ingredientId: string, quantity: Quantity) => void;
  onRevert: (ingredientId: string) => void;
};

export function QuantityDialog({ ingredient, onOpenChange, onSave, onRevert }: Props) {
  return (
    <Dialog open={ingredient !== null} onOpenChange={onOpenChange}>
      <DialogContent className="top-auto bottom-0 translate-y-0 rounded-b-none p-5 sm:top-1/2 sm:bottom-auto sm:max-w-md sm:-translate-y-1/2 sm:rounded-xl">
        {/* Remount per ingredient so the input starts from that ingredient's amount. */}
        {ingredient ? <Form key={ingredient.id} ingredient={ingredient} onSave={onSave} onRevert={onRevert} close={() => onOpenChange(false)} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function Form({ ingredient, onSave, onRevert, close }: { ingredient: ViewIngredient; onSave: Props["onSave"]; onRevert: Props["onRevert"]; close: () => void }) {
  const [value, setValue] = useState(ingredient.displayQuantity?.raw ?? "");
  const [error, setError] = useState<string | null>(null);
  const inputId = useId();
  const original = ingredient.original;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const q = parseQuantity(value);
        if (!q) return setError("Enter an amount, like “2 cups” or “a pinch”.");
        if (q.raw.length > 60) return setError("Keep it short, like “2 cups”.");
        onSave(ingredient.id, q);
        close();
      }}
      className="grid gap-4"
    >
      <DialogHeader className="text-left">
        <DialogTitle className="font-heading text-2xl font-black tracking-tight">{ingredient.name}</DialogTitle>
        <DialogDescription className="text-base">
          {original.quantity
            ? `In the recipe: ${original.quantity.raw} (${LABEL_TEXT[original.label]}).`
            : "This amount is missing from the video. Add the amount you're using."}
        </DialogDescription>
      </DialogHeader>
      <div className="grid gap-1.5">
        <label htmlFor={inputId} className="label-mono">
          Your amount
        </label>
        <Input
          id={inputId}
          autoFocus
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            if (error) setError(null);
          }}
          placeholder="e.g. 2 cups, 150 g, a pinch"
          aria-invalid={Boolean(error)}
          className="h-12 text-base md:text-base"
          maxLength={80}
        />
        <p role="alert" className="min-h-5 text-sm text-destructive">
          {error}
        </p>
      </div>
      <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:justify-between">
        {ingredient.edited ? (
          <Button
            type="button"
            variant="ghost"
            size="xl"
            onClick={() => {
              onRevert(ingredient.id);
              close();
            }}
          >
            {original.quantity ? `Use the original (${original.quantity.raw})` : "Remove my amount"}
          </Button>
        ) : (
          <span className="hidden sm:block" />
        )}
        <Button type="submit" size="xl">
          Save amount
        </Button>
      </DialogFooter>
    </form>
  );
}
