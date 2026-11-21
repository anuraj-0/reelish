"use client";

import { ArrowLeft, ArrowRight, Check, ExternalLink, Play, Sun, SunDim, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { QuantityButton } from "@/components/recipe/quantity-button";
import { QuantityDialog } from "@/components/recipe/quantity-dialog";
import { StepDetails } from "@/components/recipe/step-details";
import { StepsSheet } from "./steps-sheet";
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
      <Shell recipe={recipe} wake={wake} progress={null} nav={null}>
        <p className="text-lg">This recipe has no steps to follow.</p>
      </Shell>
    );
  }

  if (finished) {
    return (
      <Shell recipe={recipe} wake={wake} progress={null} nav={null}>
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
    <Shell recipe={recipe} wake={wake} progress={{ index, total }} nav={<StepsSheet steps={view.steps} current={index} onJump={setStep} />}>
      <div className="flex-1 space-y-4 pb-6 sm:space-y-7 sm:pt-2">
        {/* Scales with the screen: ~24px on a 375px phone, up to 36px on large screens. */}
        <h1 ref={headingRef} tabIndex={-1} className="font-sans text-[clamp(1.3rem,0.9rem+2.4vw,2.25rem)] leading-snug font-medium tracking-tight outline-none">
          <span className="sr-only">
            Step {index + 1} of {total}:{" "}
          </span>
          {step.text}
        </h1>

        <StepDetails step={step} size="cook" />

        {step.ingredients.length ? (
          <section aria-labelledby="need-heading" className="space-y-1.5 sm:space-y-2">
            <h2 id="need-heading" className="font-sans text-sm font-semibold tracking-wide text-muted-foreground uppercase">
              For this step
            </h2>
            <ul className="divide-y rounded-2xl border bg-card px-4">
              {step.ingredients.map((ing) => (
                <li key={ing.id} className="flex min-h-12 items-center justify-between gap-3 py-1 sm:min-h-16 sm:py-2">
                  <span className="min-w-0 text-[1.05rem] leading-snug sm:text-lg">
                    <span className="font-medium">{ing.name}</span>
                    {ing.preparation ? <span className="text-muted-foreground"> · {ing.preparation}</span> : null}
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

function Shell({ recipe, wake, progress, nav, children }: { recipe: Recipe; wake: WakeLockState; progress: { index: number; total: number } | null; nav: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col px-5">
      <header className="sticky top-0 z-10 -mx-5 space-y-2.5 bg-background px-5 pt-2 pb-3 sm:space-y-3 sm:pt-3">
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="icon" className="size-12 rounded-xl [&_svg:not([class*='size-'])]:size-6">
            <Link href={`/r/${recipe.id}`} aria-label="Leave Cook Mode and go back to the recipe">
              <X aria-hidden />
            </Link>
          </Button>
          <div className="min-w-0 flex-1">
            <p className="hidden truncate text-sm text-muted-foreground sm:block">{recipe.title}</p>
            {progress ? (
              <p className="font-semibold tabular-nums">
                Step {progress.index + 1} of {progress.total}
              </p>
            ) : null}
          </div>
          <WakeIndicator state={wake} />
          {nav}
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
  const text = on ? "Screen on" : state === "pending" ? "Screen…" : "May dim";
  const help = state === "unsupported" ? "This browser can't keep the screen on. Adjust your display settings if it dims." : state === "denied" ? "The browser didn't allow keeping the screen on (battery saver can block it)." : undefined;
  return (
    <span title={help ?? (on ? "Your screen will stay on while you cook" : undefined)} className={cn("inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-xs font-medium", on ? "bg-confirmed/10 text-confirmed" : "bg-muted text-muted-foreground")}>
      {on ? <Sun className="size-4" aria-hidden /> : <SunDim className="size-4" aria-hidden />}
      <span className="sr-only sm:not-sr-only">{text}</span>
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
