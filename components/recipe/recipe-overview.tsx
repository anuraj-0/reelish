"use client";

import { ArrowLeft, ChefHat, ChevronDown, CircleCheck, ExternalLink, Info, Play, RotateCcw } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useRecipeState } from "@/hooks/use-recipe-state";
import { canSeek, formatMinutes, formatTimestamp, hostname, PLATFORM_NAME, videoLink } from "@/lib/format";
import { applyEdits, missingQuantityCount, type ViewIngredient } from "@/lib/recipe/edits";
import { missingNotice } from "@/lib/recipe/missing";
import { LABEL_TEXT, SOURCE_TEXT } from "@/lib/recipe/labels";
import type { Recipe, SourceKind } from "@/lib/recipe/schema";
import { cn } from "@/lib/utils";
import { CreatorWording } from "./creator-wording";
import { QuantityButton } from "./quantity-button";
import { QuantityDialog } from "./quantity-dialog";
import { StepDetails } from "./step-details";

export function RecipeOverview({ recipe }: { recipe: Recipe }) {
  const { state, setQuantity, revertQuantity, toggleChecked, clearChecked } = useRecipeState(recipe.id);
  const view = useMemo(() => applyEdits(recipe, state.edits), [recipe, state.edits]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const editing = view.ingredients.find((i) => i.id === editingId) ?? null;
  const missing = missingQuantityCount(view);
  const notice = missingNotice(view);
  const checked = new Set(state.checked);
  const readyCount = view.ingredients.filter((i) => checked.has(i.id)).length;
  const groups = groupIngredients(view.ingredients);
  const inProgress = state.step > 0 && !state.finished;
  const canCook = recipe.steps.length > 0;

  // Only what the recipe actually has: no empty placeholders for missing servings or times.
  const facts = [
    `${recipe.ingredients.length} ${recipe.ingredients.length === 1 ? "ingredient" : "ingredients"}`,
    `${recipe.steps.length} ${recipe.steps.length === 1 ? "step" : "steps"}`,
    recipe.servings && `Serves ${recipe.servings.raw}`,
    recipe.prepTime && `Prep ${formatMinutes(recipe.prepTime)}`,
    recipe.cookTime && `Cook ${formatMinutes(recipe.cookTime)}`,
    recipe.totalTime && `Total ${formatMinutes(recipe.totalTime)}`,
  ].filter(Boolean) as string[];

  const cookHref = `/r/${recipe.id}/cook`;
  const cookLabel = inProgress ? `Resume cooking · step ${state.step + 1} of ${recipe.steps.length}` : "Start cooking";
  const creator = [recipe.source.creator.name ?? (recipe.source.creator.handle && `@${recipe.source.creator.handle}`), PLATFORM_NAME[recipe.source.platform]]
    .filter(Boolean)
    .join(" · ");

  return (
    <>
      {/* Phones/tablet portrait: one column. ≥1024px: overview row, then ingredients | instructions. */}
      <div className={cn("mx-auto w-full max-w-2xl px-5 pt-4 lg:max-w-6xl lg:px-10 lg:pb-20", canCook ? "pb-36" : "pb-16")}>
        <nav className="flex items-center justify-between gap-2">
          <Button asChild variant="ghost" size="xl" className="-ml-3 px-3">
            <Link href="/">
              <ArrowLeft aria-hidden /> <span className="sm:hidden">New video</span>
              <span className="hidden sm:inline">Convert another video</span>
            </Link>
          </Button>
          <Button asChild variant="outline" size="xl" className="shadow-none">
            <a href={recipe.source.url} target="_blank" rel="noopener noreferrer nofollow">
              Watch video <ExternalLink aria-hidden />
            </a>
          </Button>
        </nav>

        <main>
          {/* A. Overview */}
          <header className="mt-4 space-y-5 lg:mt-8 lg:grid lg:grid-cols-[minmax(0,24rem)_minmax(0,1fr)] lg:items-start lg:gap-10 lg:space-y-0">
            {recipe.source.thumbnailUrl ? (
              <a
                href={recipe.source.url}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="group relative block aspect-video overflow-hidden border-2 border-foreground bg-muted outline-none focus-visible:ring-3 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                <Image src={recipe.source.thumbnailUrl} alt={`Still from the video "${recipe.title}"`} fill sizes="(max-width: 1023px) 672px, 384px" className="object-cover" priority />
                <span className="absolute inset-0 grid place-items-center bg-black/10 transition-colors group-hover:bg-black/25">
                  <span className="grid size-14 place-items-center border-2 border-foreground bg-accent text-accent-foreground transition-transform group-hover:scale-105">
                    <Play className="ml-0.5 size-6 fill-current" aria-hidden />
                  </span>
                </span>
                <span className="sr-only">Watch on {PLATFORM_NAME[recipe.source.platform]}</span>
              </a>
            ) : null}
            <div className={cn("space-y-4", !recipe.source.thumbnailUrl && "lg:col-span-2 lg:max-w-3xl")}>
              <div className="space-y-2">
                <p className="label-mono text-muted-foreground">{creator}</p>
                <h1 className="text-[2.1rem] leading-[1.04] font-black tracking-[-0.02em] [font-stretch:80%] sm:text-5xl lg:text-[3.25rem]">{recipe.title}</h1>
              </div>
              <ul aria-label="Recipe details" className="flex flex-wrap items-center gap-x-2 gap-y-1 font-semibold tabular-nums">
                {facts.map((f, i) => (
                  <li key={f} className="flex items-center gap-2">
                    {i > 0 ? (
                      <span aria-hidden className="text-muted-foreground">
                        ·
                      </span>
                    ) : null}
                    {f}
                  </li>
                ))}
              </ul>
              {missing === 0 && view.ingredients.length ? (
                <p className="flex items-center gap-1.5 text-sm font-semibold text-confirmed">
                  <CircleCheck className="size-4 shrink-0" aria-hidden />
                  {view.ingredients.some((i) => i.optional && !i.displayQuantity) ? "Every amount is given, except optional extras" : "Every amount is given"}
                </p>
              ) : null}
              {notice ? (
                <div role="note" aria-label="Missing from the video" className="flex gap-3 border-2 border-foreground bg-missing-bg px-4 py-3 text-missing-ink">
                  <Info className="mt-0.5 size-5 shrink-0" aria-hidden />
                  <div className="space-y-1.5 text-[0.95rem] leading-snug">
                    <p className="font-semibold">{notice.headline}</p>
                    {notice.details.length ? (
                      <ul className="list-disc space-y-0.5 pl-4">
                        {notice.details.map((d) => (
                          <li key={d}>{d}</li>
                        ))}
                      </ul>
                    ) : null}
                    {missing > 0 ? <p>Tap Add amount on an ingredient to fill in your own.</p> : null}
                  </div>
                </div>
              ) : null}
              {/* Wide screens: the main action sits with the title instead of a bottom bar. */}
              {canCook ? (
                <Button asChild size="xl" className="hidden lg:inline-flex">
                  <Link href={cookHref}>
                    <ChefHat aria-hidden />
                    {cookLabel}
                  </Link>
                </Button>
              ) : null}
            </div>
          </header>

          <div className="lg:mt-12 lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-start lg:gap-14">
            {/* B. Ingredients: stay in view while the instructions scroll (wide screens). */}
            <div className="lg:fade-bottom lg:sticky lg:top-6 lg:max-h-[calc(100dvh-3rem)] lg:overflow-y-auto lg:px-1 lg:pb-10">
              <section aria-labelledby="ingredients-heading" className="mt-10 lg:mt-0">
                <div className="flex items-end justify-between gap-3">
                  <h2 id="ingredients-heading" className="text-3xl font-black tracking-tight [font-stretch:80%]">
                    Ingredients
                  </h2>
                  {readyCount > 0 ? (
                    <button type="button" onClick={clearChecked} className="-mb-2 inline-flex min-h-11 items-center gap-1.5 px-1 text-sm font-medium underline decoration-2 underline-offset-4 outline-none hover:decoration-accent focus-visible:ring-3 focus-visible:ring-ring">
                      <RotateCcw className="size-4" aria-hidden /> Uncheck all
                    </button>
                  ) : null}
                </div>
                <div className="mt-2 space-y-2">
                  <p className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
                    <span aria-live="polite" className="font-semibold tabular-nums">
                      {readyCount} of {view.ingredients.length} ingredients ready
                    </span>
                    <span className="text-muted-foreground">Check off ingredients as you go.</span>
                  </p>
                  <div aria-hidden className="h-1.5 bg-foreground/10">
                    <div className="h-full bg-foreground transition-[width] duration-200" style={{ width: `${view.ingredients.length ? (readyCount / view.ingredients.length) * 100 : 0}%` }} />
                  </div>
                </div>
                {groups.map(({ group, items }) => (
                  <div key={group ?? "_"} className="mt-4">
                    {group ? <h3 className="label-mono mt-6 mb-2 text-foreground">{group}</h3> : null}
                    <ul className="divide-y divide-foreground/15 border-2 border-foreground bg-card px-4">
                      {items.map((ing) => (
                        <IngredientRow key={ing.id} ingredient={ing} checked={checked.has(ing.id)} onChecked={(v) => toggleChecked(ing.id, v)} onEdit={() => setEditingId(ing.id)} />
                      ))}
                    </ul>
                  </div>
                ))}
              </section>
            </div>

            <div>
              {/* C. Instructions */}
              <section aria-labelledby="steps-heading" className="mt-12 lg:mt-0">
                <h2 id="steps-heading" className="text-3xl font-black tracking-tight [font-stretch:80%]">
                  Instructions
                </h2>
                {view.steps.length ? (
                  <ol className="mt-3">
                    {view.steps.map((step, i) => (
                      <li key={step.id} className="flex gap-4 border-b border-foreground/15 py-5 last:border-b-0 lg:py-6">
                        <span aria-hidden className="grid size-9 shrink-0 place-items-center bg-foreground font-mono text-sm font-semibold text-background tabular-nums">
                          {i + 1}
                        </span>
                        <div className="min-w-0 flex-1 space-y-2.5 pt-1">
                          <p className="max-w-[65ch] text-[1.075rem] leading-relaxed lg:text-lg lg:leading-relaxed">{step.text}</p>
                          <StepDetails step={step} />
                          {step.videoTimestampSec !== null && canSeek(recipe.source.platform) ? (
                            <a
                              href={videoLink(recipe, step.videoTimestampSec)}
                              target="_blank"
                              rel="noopener noreferrer nofollow"
                              className="inline-flex min-h-9 items-center gap-1.5 text-sm font-semibold underline decoration-accent decoration-2 underline-offset-4 outline-none hover:bg-accent hover:no-underline focus-visible:ring-3 focus-visible:ring-ring"
                            >
                              <Play className="size-3.5 fill-current" aria-hidden /> Watch at {formatTimestamp(step.videoTimestampSec)}
                            </a>
                          ) : null}
                        </div>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="mt-3 text-muted-foreground">The video doesn&apos;t show the cooking steps. Watch the original video for how it&apos;s made.</p>
                )}
              </section>

              {/* D. Additional details */}
              {recipe.notes.length ? (
                <section aria-labelledby="notes-heading" className="mt-10">
                  <h2 id="notes-heading" className="text-2xl font-black tracking-tight [font-stretch:80%]">
                    Notes from the creator
                  </h2>
                  <ul className="mt-3 max-w-[65ch] list-disc space-y-1.5 pl-5">
                    {recipe.notes.map((n) => (
                      <li key={n.text}>{n.text}</li>
                    ))}
                  </ul>
                </section>
              ) : null}

              <SourcesPanel recipe={recipe} />
            </div>
          </div>

          {canCook ? (
            <div className="fixed inset-x-0 bottom-0 border-t-2 border-foreground bg-background px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:hidden">
              <div className="mx-auto max-w-2xl">
                <Button asChild size="touch" className="w-full">
                  <Link href={cookHref}>
                    <ChefHat aria-hidden />
                    {cookLabel}
                  </Link>
                </Button>
              </div>
            </div>
          ) : null}
        </main>
      </div>

      <QuantityDialog ingredient={editing} onOpenChange={(open) => !open && setEditingId(null)} onSave={setQuantity} onRevert={revertQuantity} />
    </>
  );
}

function IngredientRow({ ingredient, checked, onChecked, onEdit }: { ingredient: ViewIngredient; checked: boolean; onChecked: (v: boolean) => void; onEdit: () => void }) {
  const id = `ing-${ingredient.id}`;
  return (
    <li className="flex items-center gap-3 py-3">
      <Checkbox id={id} checked={checked} onCheckedChange={(v) => onChecked(v === true)} className="size-7 [&_svg]:size-5" />
      <label htmlFor={id} className="min-w-0 flex-1 cursor-pointer py-1">
        <span className={cn("block text-[1.05rem] leading-snug font-medium", checked && "text-muted-foreground line-through")}>
          {ingredient.name}
          {ingredient.optional ? <span className="font-normal text-muted-foreground"> (optional)</span> : null}
        </span>
        {ingredient.preparation ? <span className={cn("block text-sm text-muted-foreground", checked && "line-through")}>{ingredient.preparation}</span> : null}
        <CreatorWording ingredient={ingredient} />
      </label>
      <QuantityButton ingredient={ingredient} onEdit={onEdit} />
    </li>
  );
}

function groupIngredients(items: ViewIngredient[]) {
  const out: { group: string | null; items: ViewIngredient[] }[] = [];
  for (const item of items) {
    const last = out.find((g) => g.group === item.group);
    if (last) last.items.push(item);
    else out.push({ group: item.group, items: [item] });
  }
  return out;
}

function SourcesPanel({ recipe }: { recipe: Recipe }) {
  const used = new Set<SourceKind>();
  for (const e of [...recipe.ingredients.flatMap((i) => i.evidence), ...recipe.steps.flatMap((s) => s.evidence)]) used.add(e.source);

  return (
    <details className="group mt-12 border-2 border-foreground bg-card text-[0.95rem]">
      <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-5 py-3 outline-none hover:bg-secondary focus-visible:ring-3 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
        <h2 className="text-xl font-black tracking-tight [font-stretch:85%]">How this recipe was created</h2>
        <ChevronDown className="size-5 shrink-0 transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <div className="space-y-5 border-t-2 border-foreground px-5 pt-4 pb-5">
        <p className="text-muted-foreground">Reelish read these sources and wrote up the recipe. It doesn&apos;t fill in amounts the creator didn&apos;t give.</p>
        <div className="space-y-1.5">
          <h3 className="label-mono text-muted-foreground">Sources</h3>
          <ul className="space-y-1">
            {[...used].map((s) => (
              <li key={s} className="flex gap-2">
                <span aria-hidden>·</span>
                <span>
                  {SOURCE_TEXT[s]}
                  {s === "linked_recipe" && recipe.source.linkedRecipeUrls.length
                    ? recipe.source.linkedRecipeUrls.map((u) => (
                        <a key={u} href={u} target="_blank" rel="noopener noreferrer nofollow" className="ml-1 font-semibold underline decoration-accent decoration-2 underline-offset-4 hover:bg-accent">
                          at {hostname(u)}
                        </a>
                      ))
                    : null}
                </span>
              </li>
            ))}
          </ul>
        </div>

        {recipe.conflicts.length ? (
          <div className="space-y-1.5">
            <h3 className="label-mono text-muted-foreground">Checked against each other</h3>
            <ul className="space-y-1">
              {recipe.conflicts.map((c) => (
                <li key={c.path}>{c.description}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="space-y-1.5">
          <h3 className="label-mono text-muted-foreground">What the amount labels mean</h3>
          <dl className="grid gap-2">
            <Legend term={LABEL_TEXT.confirmed} className="text-confirmed">Said, shown or written by the creator: in the video, caption, description or linked recipe. Shown without a label.</Legend>
            <Legend term={LABEL_TEXT.suggested} className="text-suggested">Worked out by Reelish from the video, not stated by the creator. Worth a double-check.</Legend>
            <Legend term={LABEL_TEXT.not_specified} className="text-foreground">The creator didn&apos;t give it. Tap Add amount to use your own.</Legend>
            <Legend term={LABEL_TEXT.edited} className="text-foreground underline decoration-accent decoration-2 underline-offset-2">Your own amount. The original is kept, so you can switch back.</Legend>
          </dl>
        </div>
      </div>
    </details>
  );
}

function Legend({ term, className, children }: { term: string; className: string; children: React.ReactNode }) {
  return (
    <div className="sm:grid sm:grid-cols-[8.5rem_1fr] sm:gap-3">
      <dt className={cn("font-semibold", className)}>{term}</dt>
      <dd className="text-muted-foreground">{children}</dd>
    </div>
  );
}
