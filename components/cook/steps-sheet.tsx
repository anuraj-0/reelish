"use client";

import { ListOrdered } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import type { Step } from "@/lib/recipe/schema";
import { cn } from "@/lib/utils";

/** Every step, current one highlighted; tap to jump. Used in the phone sheet and the desktop rail. */
export function StepList({ steps, current, onJump, className }: { steps: Step[]; current: number; onJump: (index: number) => void; className?: string }) {
  const listRef = useRef<HTMLOListElement>(null);
  // In the desktop rail, keep the current step in view without moving the page itself.
  useEffect(() => {
    const active = listRef.current?.querySelector<HTMLElement>('[aria-current="step"]');
    const box = active?.closest<HTMLElement>("[data-scroll-container]");
    if (!active || !box) return;
    const top = active.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop;
    const bottom = top + active.offsetHeight;
    if (top < box.scrollTop + 48) box.scrollTop = Math.max(0, top - 48);
    else if (bottom > box.scrollTop + box.clientHeight - 48) box.scrollTop = bottom - box.clientHeight + 48;
  }, [current]);
  return (
    <ol ref={listRef} className={className}>
      {steps.map((s, i) => (
        <li key={s.id}>
          <button
            type="button"
            aria-current={i === current ? "step" : undefined}
            onClick={() => onJump(i)}
            className={cn(
              "flex w-full gap-3 rounded-xl px-3 py-3 text-left outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50",
              i === current && "bg-accent hover:bg-accent",
            )}
          >
            <span
              aria-hidden
              className={cn(
                "grid size-7 shrink-0 place-items-center rounded-full text-sm font-semibold tabular-nums",
                i === current ? "bg-primary text-primary-foreground" : "bg-secondary",
                i < current && "text-muted-foreground",
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
  );
}

/** Phones and tablets: a sheet to glance at or jump to any step without paging through them. */
export function StepsSheet({ steps, current, onJump }: { steps: Step[]; current: number; onJump: (index: number) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="xl" className="h-11 shrink-0 rounded-xl px-3 lg:hidden">
          <ListOrdered aria-hidden /> Steps
        </Button>
      </DialogTrigger>
      <DialogContent className="top-auto bottom-0 max-h-[85dvh] translate-y-0 grid-rows-[auto_1fr] rounded-b-none p-0 sm:top-1/2 sm:bottom-auto sm:max-w-lg sm:-translate-y-1/2 sm:rounded-xl">
        <DialogHeader className="px-5 pt-5 text-left">
          <DialogTitle className="font-heading text-xl">All steps</DialogTitle>
          <DialogDescription>Tap a step to go to it.</DialogDescription>
        </DialogHeader>
        <StepList
          steps={steps}
          current={current}
          onJump={(i) => {
            onJump(i);
            setOpen(false);
          }}
          className="overflow-y-auto px-3 pb-[max(1rem,env(safe-area-inset-bottom))]"
        />
      </DialogContent>
    </Dialog>
  );
}
