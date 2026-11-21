"use client";

import { ListOrdered } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import type { Step } from "@/lib/recipe/schema";
import { cn } from "@/lib/utils";

/** Lets the cook glance at or jump to any step without paging through them. */
export function StepsSheet({ steps, current, onJump }: { steps: Step[]; current: number; onJump: (index: number) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="xl" className="h-11 shrink-0 rounded-xl px-3">
          <ListOrdered aria-hidden /> Steps
        </Button>
      </DialogTrigger>
      <DialogContent className="top-auto bottom-0 max-h-[85dvh] translate-y-0 grid-rows-[auto_1fr] rounded-b-none p-0 sm:top-1/2 sm:bottom-auto sm:max-w-lg sm:-translate-y-1/2 sm:rounded-xl">
        <DialogHeader className="px-5 pt-5 text-left">
          <DialogTitle className="font-heading text-xl">All steps</DialogTitle>
          <DialogDescription>Tap a step to go to it.</DialogDescription>
        </DialogHeader>
        <ol className="overflow-y-auto px-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {steps.map((s, i) => (
            <li key={s.id}>
              <button
                type="button"
                aria-current={i === current ? "step" : undefined}
                onClick={() => {
                  onJump(i);
                  setOpen(false);
                }}
                className={cn(
                  "flex w-full gap-3 rounded-xl px-3 py-3 text-left outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50",
                  i === current && "bg-accent",
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "grid size-7 shrink-0 place-items-center rounded-full text-sm font-semibold tabular-nums",
                    i === current ? "bg-primary text-primary-foreground" : i < current ? "bg-secondary text-muted-foreground" : "bg-secondary",
                  )}
                >
                  {i + 1}
                </span>
                <span className={cn("line-clamp-3 pt-0.5", i < current && "text-muted-foreground")}>
                  <span className="sr-only">
                    Step {i + 1}
                    {i === current ? " (current)" : ""}:{" "}
                  </span>
                  {s.text}
                </span>
              </button>
            </li>
          ))}
        </ol>
      </DialogContent>
    </Dialog>
  );
}
