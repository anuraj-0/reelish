"use client";

import { ArrowLeft, ArrowRight, Check, ExternalLink, Play, Sun, SunDim, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { QuantityButton } from "@/components/recipe/quantity-button";
import { QuantityDialog } from "@/components/recipe/quantity-dialog";
import { StepDetails } from "@/components/recipe/step-details";
import { Button } from "@/components/ui/button";
import { useRecipeState } from "@/hooks/use-recipe-state";
import { useWakeLock, type WakeLockState } from "@/hooks/use-wake-lock";
import { canSeek, formatTimestamp, PLATFORM_NAME, videoLink } from "@/lib/format";
import { applyEdits } from "@/lib/recipe/edits";
import type { Recipe } from "@/lib/recipe/schema";
import { cn } from "@/lib/utils";

export function CookMode({ recipe }: { recipe: Recipe }) {
  const { state, setStep, finish, restartCooking, setQuantity, revertQuantity } = useRecipeState(recipe.id);
  const view = useMemo(() => applyEdits(recipe, state.edits), [recipe, state.edits]);
  const total = view.steps.length;
  const index = Math.min(state.step, Math.max(0, total - 1));
  const step = view.steps[index];
  const finished = state.finished;
  const wake = useWakeLock(!finished);
  const [editingId, setEditingId] = useState<string | null>(null);
  const editing = view.ingredients.find((i) => i.id === editingId) ?? null;
  const headingRef = useRef<HTMLHeadingElement>(null);

  const goNext = () => (index + 1 < total ? setStep(index + 1) : finish());
  const goBack = () => index > 0 && setStep(index - 1);

  // Move focus to the new step so screen readers announce it and keyboard users stay oriented.
  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
    window.scrollTo({ top: 0 });
  }, [index, finished]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (editingId || e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.key === "ArrowRight") goNext();
      if (e.key === "ArrowLeft") goBack();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!step) {
    return (
      <Shell recipe={recipe} wake={wake} progress={null}>
        <p className="text-lg">This recipe has no steps to follow.</p>
      </Shell>
    );
  }

  if (finished) {
    return (
      <Shell recipe={recipe} wake={wake} progress={null}>
        <div className="flex flex-1 flex-col justify-center gap-6 py-10">
          <span className="grid size-16 place-items-center rounded-full bg-confirmed/15 text-confirmed">
            <Check className="size-8" aria-hidden />
          </span>
          <h1 ref={headingRef} tabIndex={-1} className="text-4xl font-semibold tracking-tight outline-none">
            That&apos;s every step.
          </h1>
          <p className="text-xl text-muted-foreground">Enjoy your {recipe.title.toLowerCase()}.</p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button asChild size="touch">
              <Link href={`/r/${recipe.id}`}>Back to the recipe</Link>
            </Button>
            <Button size="touch" variant="outline" onClick={restartCooking}>
              Start over
            </Button>
          </div>
        </div>
      </Shell>
    );
  }

  return (
    <Shell recipe={recipe} wake={wake} progress={{ index, total }}>
      <div className="flex-1 space-y-7 pt-2 pb-6">
        <h1 ref={headingRef} tabIndex={-1} className="font-sans text-[1.75rem] leading-snug font-medium tracking-tight outline-none sm:text-4xl sm:leading-snug">
          <span className="sr-only">
            Step {index + 1} of {total}:{" "}
          </span>
          {step.text}
        </h1>

        <StepDetails step={step} size="lg" />

        {step.ingredients.length ? (
          <section aria-labelledby="need-heading" className="space-y-2">
            <h2 id="need-heading" className="font-sans text-sm font-semibold tracking-wide text-muted-foreground uppercase">
              For this step
            </h2>
            <ul className="divide-y rounded-2xl border bg-card px-4">
              {step.ingredients.map((ing) => (
                <li key={ing.id} className="flex min-h-16 items-center justify-between gap-3 py-2">
                  <span className="min-w-0">
                    <span className="block text-lg leading-snug font-medium">{ing.name}</span>
                    {ing.preparation ? <span className="block text-muted-foreground">{ing.preparation}</span> : null}
                  </span>
                  <QuantityButton ingredient={ing} size="lg" onEdit={() => setEditingId(ing.id)} />
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <VideoLink recipe={recipe} at={step.videoTimestampSec} />
      </div>

      <div className="sticky bottom-0 -mx-5 flex gap-3 border-t bg-background px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <Button size="touch" variant="outline" onClick={goBack} disabled={index === 0} className="w-[38%]">
          <ArrowLeft aria-hidden /> Back
        </Button>
        <Button size="touch" onClick={goNext} className="flex-1">
          {index + 1 < total ? (
            <>
              Next <ArrowRight aria-hidden />
            </>
          ) : (
            <>
              Finish <Check aria-hidden />
            </>
          )}
        </Button>
      </div>

      <QuantityDialog ingredient={editing} onOpenChange={(open) => !open && setEditingId(null)} onSave={setQuantity} onRevert={revertQuantity} />
    </Shell>
  );
}

function Shell({ recipe, wake, progress, children }: { recipe: Recipe; wake: WakeLockState; progress: { index: number; total: number } | null; children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col px-5">
      <header className="sticky top-0 z-10 -mx-5 space-y-3 bg-background px-5 pt-3 pb-3">
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="icon" className="size-12 rounded-xl [&_svg:not([class*='size-'])]:size-6">
            <Link href={`/r/${recipe.id}`} aria-label="Leave Cook Mode and go back to the recipe">
              <X aria-hidden />
            </Link>
          </Button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm text-muted-foreground">{recipe.title}</p>
            {progress ? (
              <p className="font-semibold tabular-nums">
                Step {progress.index + 1} of {progress.total}
              </p>
            ) : null}
          </div>
          <WakeIndicator state={wake} />
        </div>
        {progress ? (
          <div
            role="progressbar"
            aria-label="Cooking progress"
            aria-valuemin={1}
            aria-valuemax={progress.total}
            aria-valuenow={progress.index + 1}
            aria-valuetext={`Step ${progress.index + 1} of ${progress.total}`}
            className="flex gap-1"
          >
            {Array.from({ length: progress.total }, (_, i) => (
              <span key={i} className={cn("h-1.5 flex-1 rounded-full", i <= progress.index ? "bg-primary" : "bg-border")} />
            ))}
          </div>
        ) : null}
      </header>
      <main className="flex flex-1 flex-col">{children}</main>
    </div>
  );
}

function WakeIndicator({ state }: { state: WakeLockState }) {
  const on = state === "active";
  const text = on ? "Screen stays on" : state === "pending" ? "Keeping screen on…" : "Screen may dim";
  const help = state === "unsupported" ? "This browser can't keep the screen on. Adjust your display settings if it dims." : state === "denied" ? "The browser didn't allow keeping the screen on (battery saver can block it)." : undefined;
  return (
    <span title={help} className={cn("inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium", on ? "bg-confirmed/10 text-confirmed" : "bg-muted text-muted-foreground")}>
      {on ? <Sun className="size-4" aria-hidden /> : <SunDim className="size-4" aria-hidden />}
      <span>{text}</span>
      {help ? <span className="sr-only">. {help}</span> : null}
    </span>
  );
}

function VideoLink({ recipe, at }: { recipe: Recipe; at: number | null }) {
  const name = PLATFORM_NAME[recipe.source.platform];
  if (at !== null && canSeek(recipe.source.platform)) {
    return (
      <a href={videoLink(recipe, at)} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex min-h-12 items-center gap-2 rounded-xl font-medium text-primary underline-offset-4 hover:underline">
        <Play className="size-4 fill-current" aria-hidden /> Watch this step ({formatTimestamp(at)})
      </a>
    );
  }
  return (
    <a href={recipe.source.url} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex min-h-12 items-center gap-2 rounded-xl font-medium text-primary underline-offset-4 hover:underline">
      <ExternalLink className="size-4" aria-hidden />
      {at !== null ? `Open the video on ${name} (this step is around ${formatTimestamp(at)})` : `Open the video on ${name}`}
    </a>
  );
}
