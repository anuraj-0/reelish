"use client";

import { ArrowLeft, ArrowRight, Check, ChevronDown, ExternalLink, Play, Sun, SunDim, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { QuantityButton } from "@/components/recipe/quantity-button";
import { CreatorWording } from "@/components/recipe/creator-wording";
import { QuantityDialog } from "@/components/recipe/quantity-dialog";
import { StepDetails } from "@/components/recipe/step-details";
import { StepList, StepsSheet } from "./steps-sheet";
import { Button } from "@/components/ui/button";
import { useRecipeState } from "@/hooks/use-recipe-state";
import { useWakeLock, type WakeLockState } from "@/hooks/use-wake-lock";
import { canSeek, formatTimestamp, PLATFORM_NAME, videoLink } from "@/lib/format";
import { splitStepIngredients } from "@/lib/recipe/cook";
import { applyEdits, type ViewIngredient } from "@/lib/recipe/edits";
import type { Recipe } from "@/lib/recipe/schema";
import { cn } from "@/lib/utils";

export function CookMode({ recipe }: { recipe: Recipe }) {
  const { state, setStep, finish, restartCooking, setQuantity, revertQuantity } = useRecipeState(recipe.id);
  const view = useMemo(() => applyEdits(recipe, state.edits), [recipe, state.edits]);
  const total = view.steps.length;
  const index = Math.min(state.step, Math.max(0, total - 1));
  const step = view.steps[index];
  const { now, earlier } = splitStepIngredients(view.steps, index);
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
      <Shell recipe={recipe} wake={wake} progress={null} nav={null} rail={null}>
        <p className="text-lg">This recipe has no steps to follow.</p>
      </Shell>
    );
  }

  if (finished) {
    return (
      <Shell recipe={recipe} wake={wake} progress={null} nav={null} rail={null}>
        <div className="flex flex-1 flex-col justify-center gap-6 py-10">
          <span className="brut-shadow grid size-16 place-items-center border-2 border-foreground bg-accent text-accent-foreground">
            <Check className="size-8" strokeWidth={3} aria-hidden />
          </span>
          <h1 ref={headingRef} tabIndex={-1} className="text-5xl leading-none font-black tracking-tight uppercase outline-none [font-stretch:75%] sm:text-6xl">
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
    <Shell
      recipe={recipe}
      wake={wake}
      progress={{ index, total }}
      nav={<StepsSheet steps={view.steps} current={index} onJump={setStep} />}
      rail={
        <nav aria-labelledby="rail-heading">
          <h2 id="rail-heading" className="label-mono px-3 text-muted-foreground">
            All steps
          </h2>
          <StepList steps={view.steps} current={index} onJump={setStep} className="mt-2" />
        </nav>
      }
    >
      <div className="flex-1 space-y-4 pb-6 sm:space-y-7 sm:pt-2 md:flex md:flex-col md:justify-center md:space-y-0 md:gap-8 lg:justify-start lg:pt-6">
        {/* Scales with the screen: ~24px on a 375px phone, up to 42px on large screens, less on short ones (1024×768). */}
        <h1 ref={headingRef} tabIndex={-1} className="font-sans text-[clamp(1.3rem,0.9rem+2.4vw,2.25rem)] leading-snug font-semibold tracking-[-0.01em] outline-none md:max-w-[30ch] md:text-[min(2.6rem,4.4dvh)] md:leading-[1.2]">
          <span className="sr-only">
            Step {index + 1} of {total}:{" "}
          </span>
          {step.text}
        </h1>

        <StepDetails step={step} size="cook" />

        {now.length ? (
          <section aria-labelledby="need-heading" className="space-y-1.5 sm:space-y-2 md:max-w-xl">
            <h2 id="need-heading" className="label-mono text-muted-foreground">
              For this step
            </h2>
            <IngredientList items={now} onEdit={setEditingId} />
          </section>
        ) : null}

        {earlier.length ? (
          // Measured in an earlier step: kept one tap away instead of pushing this step's amounts down.
          <details key={index} className="group md:max-w-xl">
            <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
              <ChevronDown className="size-5 shrink-0 transition-transform group-open:rotate-180" aria-hidden />
              <span className="min-w-0 truncate">
                Already added ({earlier.length}): {earlier.map((i) => i.name.toLowerCase()).join(", ")}
              </span>
            </summary>
            <IngredientList items={earlier} onEdit={setEditingId} className="mt-1.5" />
          </details>
        ) : null}

        <VideoLink recipe={recipe} at={step.videoTimestampSec} />
      </div>

      <div className="sticky bottom-0 -mx-5 flex gap-3 border-t-2 border-foreground bg-background px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:mx-0 lg:mt-6 lg:max-w-xl lg:px-0 lg:pt-4 lg:pb-8">
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

function IngredientList({ items, onEdit, className }: { items: ViewIngredient[]; onEdit: (id: string) => void; className?: string }) {
  return (
    <ul className={cn("divide-y divide-foreground/20 border-2 border-foreground bg-card px-4", className)}>
      {items.map((ing) => (
        <li key={ing.id} className="flex min-h-12 items-center justify-between gap-3 py-1 sm:min-h-16 sm:py-2">
          <span className="min-w-0 text-[1.05rem] leading-snug sm:text-lg">
            <span className="font-medium">{ing.name}</span>
            {ing.preparation ? <span className="text-muted-foreground"> · {ing.preparation}</span> : null}
            <CreatorWording ingredient={ing} />
          </span>
          <QuantityButton ingredient={ing} size="lg" onEdit={() => onEdit(ing.id)} />
        </li>
      ))}
    </ul>
  );
}

function Shell({ recipe, wake, progress, nav, rail, children }: { recipe: Recipe; wake: WakeLockState; progress: { index: number; total: number } | null; nav: React.ReactNode; rail: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col px-5 lg:max-w-6xl lg:px-10">
      <header className="sticky top-0 z-10 -mx-5 space-y-2.5 border-b-2 border-foreground bg-background px-5 pt-2 pb-3 sm:space-y-3 sm:pt-3">
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="icon" className="size-12 rounded-xl [&_svg:not([class*='size-'])]:size-6">
            <Link href={`/r/${recipe.id}`} aria-label="Leave Cook Mode and go back to the recipe">
              <X aria-hidden />
            </Link>
          </Button>
          <div className="min-w-0 flex-1">
            <p className="label-mono hidden truncate text-muted-foreground sm:block">{recipe.title}</p>
            {progress ? (
              <p className="font-mono text-lg font-semibold tabular-nums">
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
              <span key={i} className={cn("h-2 flex-1", i < progress.index ? "bg-foreground" : i === progress.index ? "bg-accent outline-2 outline-foreground" : "bg-foreground/15")} />
            ))}
          </div>
        ) : null}
      </header>
      {/* ≥1024px: the active step on the left, a permanent step list on the right. */}
      <div className="flex flex-1 flex-col lg:grid lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start lg:gap-14">
        <main className="flex flex-1 flex-col lg:min-h-[calc(100dvh-6.5rem)]">{children}</main>
        {rail ? <aside data-scroll-container className="fade-bottom hidden lg:sticky lg:top-28 lg:block lg:max-h-[calc(100dvh-8rem)] lg:overflow-y-auto lg:pt-6 lg:pb-10">{rail}</aside> : null}
      </div>
    </div>
  );
}

function WakeIndicator({ state }: { state: WakeLockState }) {
  const on = state === "active";
  const text = on ? "Screen on" : state === "pending" ? "Screen…" : "May dim";
  const help = state === "unsupported" ? "This browser can't keep the screen on. Adjust your display settings if it dims." : state === "denied" ? "The browser didn't allow keeping the screen on (battery saver can block it)." : undefined;
  return (
    <span title={help ?? (on ? "Your screen will stay on while you cook" : undefined)} className={cn("label-mono inline-flex shrink-0 items-center gap-1 border-2 px-2 py-1", on ? "border-confirmed bg-confirmed text-white" : "border-foreground/30 text-muted-foreground")}>
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
      <a href={videoLink(recipe, at)} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex min-h-12 items-center gap-2 font-semibold underline decoration-accent decoration-2 underline-offset-4 outline-none hover:bg-accent hover:no-underline focus-visible:ring-3 focus-visible:ring-ring">
        <Play className="size-4 fill-current" aria-hidden /> Watch this step ({formatTimestamp(at)})
      </a>
    );
  }
  return (
    <a href={recipe.source.url} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex min-h-12 items-center gap-2 font-semibold underline decoration-accent decoration-2 underline-offset-4 outline-none hover:bg-accent hover:no-underline focus-visible:ring-3 focus-visible:ring-ring">
      <ExternalLink className="size-4" aria-hidden />
      {at !== null ? `Open the video on ${name} (this step is around ${formatTimestamp(at)})` : `Open the video on ${name}`}
    </a>
  );
}
