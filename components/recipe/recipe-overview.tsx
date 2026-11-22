"use client";

import { ArrowLeft, ChefHat, CircleCheck, Clock, ExternalLink, Info, ListOrdered, Play, RotateCcw, ShoppingBasket, Users } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useRecipeState } from "@/hooks/use-recipe-state";
import { canSeek, formatMinutes, formatTimestamp, hostname, PLATFORM_NAME, videoLink } from "@/lib/format";
import { applyEdits, missingQuantityCount, requiredIngredientCount, type ViewIngredient } from "@/lib/recipe/edits";
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
  const checked = new Set(state.checked);
  const groups = groupIngredients(view.ingredients);
  const inProgress = state.step > 0 && !state.finished;

  const facts = [
    recipe.servings && { icon: Users, label: "Serves", value: recipe.servings.raw },
    recipe.prepTime && { icon: Clock, label: "Prep", value: formatMinutes(recipe.prepTime) },
    recipe.cookTime && { icon: Clock, label: "Cook", value: formatMinutes(recipe.cookTime) },
    recipe.totalTime && { icon: Clock, label: "Total", value: formatMinutes(recipe.totalTime) },
    { icon: ShoppingBasket, label: "Ingredients", value: String(recipe.ingredients.length) },
    { icon: ListOrdered, label: "Steps", value: String(recipe.steps.length) },
  ].filter(Boolean) as { icon: typeof Clock; label: string; value: string }[];
  const noTimes = !recipe.servings && !recipe.prepTime && !recipe.cookTime && !recipe.totalTime;

  const cookHref = `/r/${recipe.id}/cook`;
  const cookLabel = inProgress ? `Resume cooking · step ${state.step + 1} of ${recipe.steps.length}` : "Start cooking";
  const creator = [recipe.source.creator.name ?? (recipe.source.creator.handle && `@${recipe.source.creator.handle}`), PLATFORM_NAME[recipe.source.platform]]
    .filter(Boolean)
    .join(" · ");

  return (
    <>
      {/* Phones/tablet portrait: one column (tested layout). ≥1024px: header row, then ingredients | steps. */}
      <div className="mx-auto w-full max-w-2xl px-5 pt-4 pb-36 lg:max-w-6xl lg:px-10 lg:pb-20">
        <nav className="flex items-center justify-between gap-2">
          <Button asChild variant="ghost" size="xl" className="-ml-3">
            <Link href="/">
              <ArrowLeft aria-hidden /> New recipe
            </Link>
          </Button>
          <Button asChild variant="outline" size="xl">
            <a href={recipe.source.url} target="_blank" rel="noopener noreferrer nofollow">
              Watch video <ExternalLink aria-hidden />
            </a>
          </Button>
        </nav>

        <main>
          <header className="mt-4 space-y-4 lg:mt-8 lg:grid lg:grid-cols-[minmax(0,24rem)_minmax(0,1fr)] lg:items-center lg:gap-10 lg:space-y-0">
            {recipe.source.thumbnailUrl ? (
              <a
                href={recipe.source.url}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="group brut-shadow relative block aspect-[2/1] overflow-hidden border-2 border-foreground bg-muted outline-none focus-visible:ring-3 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:aspect-video"
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
                <h1 className="text-[2.1rem] leading-[1.02] font-black tracking-[-0.02em] [font-stretch:80%] sm:text-5xl lg:text-6xl">{recipe.title}</h1>
              </div>
              <div className="space-y-2">
                <dl className="flex flex-wrap border-t-2 border-l-2 border-foreground bg-card">
                  {facts.map(({ icon: Icon, label, value }) => (
                    <div key={label} className="flex min-w-[6.5rem] flex-1 flex-col gap-1 border-r-2 border-b-2 border-foreground px-3 py-2">
                      <dt className="label-mono flex items-center gap-1.5 text-muted-foreground">
                        <Icon className="size-3.5" aria-hidden />
                        {label}
                      </dt>
                      <dd className="text-lg leading-tight font-extrabold tabular-nums">{value}</dd>
                    </div>
                  ))}
                </dl>
                {noTimes ? <p className="text-sm text-muted-foreground">Servings and cooking times weren&apos;t given.</p> : null}
                {missing === 0 ? (
                  <p className="flex items-center gap-1.5 text-sm font-bold text-confirmed">
                    <CircleCheck className="size-4" aria-hidden />
                    {view.ingredients.some((i) => i.optional && !i.displayQuantity) ? "All amounts given, except optional extras" : "All amounts given by the creator"}
                  </p>
                ) : null}
              </div>
              {/* Wide screens: the main action sits with the title instead of a bottom bar. */}
              <Button asChild size="xl" className="hidden lg:inline-flex">
                <Link href={cookHref}>
                  <ChefHat aria-hidden />
                  {cookLabel}
                </Link>
              </Button>
            </div>
          </header>

          <div className="lg:mt-12 lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-start lg:gap-14">
            {/* Ingredients stay in view while the steps scroll (wide screens). */}
            <div className="lg:fade-bottom lg:sticky lg:top-6 lg:max-h-[calc(100dvh-3rem)] lg:overflow-y-auto lg:pr-2 lg:pb-10">
              {missing > 0 ? (
                <div role="note" className="mt-8 flex gap-3 border-2 border-foreground bg-missing-bg px-4 py-3.5 text-[0.95rem] text-missing-ink lg:mt-0">
                  <Info className="mt-0.5 size-5 shrink-0" aria-hidden />
                  <p>
                    <span className="font-semibold">
                      The creator didn&apos;t give {missing === requiredIngredientCount(view) ? "any amounts" : `amounts for ${missing} ${missing === 1 ? "ingredient" : "ingredients"}`}.
                    </span>{" "}
                    They&apos;re marked <span className="font-bold underline decoration-2 underline-offset-2">Not specified</span>. Tap one to add your own.
                  </p>
                </div>
              ) : null}

              <section aria-labelledby="ingredients-heading" className={cn("mt-8", missing === 0 && "lg:mt-0")}>
                <div className="flex items-baseline justify-between gap-3">
                  <h2 id="ingredients-heading" className="text-3xl font-black tracking-tight [font-stretch:80%]">
                    Ingredients
                  </h2>
                  {checked.size > 0 ? (
                    <button type="button" onClick={clearChecked} className="inline-flex min-h-11 items-center gap-1.5 px-2 text-sm font-medium underline decoration-2 underline-offset-4 outline-none hover:decoration-accent focus-visible:ring-3 focus-visible:ring-ring">
                      <RotateCcw className="size-4" aria-hidden /> Uncheck all ({checked.size})
                    </button>
                  ) : (
                    <p className="label-mono text-muted-foreground">Tick them off as you prep</p>
                  )}
                </div>
                {groups.map(({ group, items }) => (
                  <div key={group ?? "_"} className="mt-3">
                    {group ? <h3 className="label-mono mt-6 mb-2 text-foreground">{group}</h3> : null}
                    <ul className="divide-y divide-foreground/20 border-2 border-foreground bg-card px-4">
                      {items.map((ing) => (
                        <IngredientRow key={ing.id} ingredient={ing} checked={checked.has(ing.id)} onChecked={(v) => toggleChecked(ing.id, v)} onEdit={() => setEditingId(ing.id)} />
                      ))}
                    </ul>
                  </div>
                ))}
              </section>
            </div>

            <div>
              <section aria-labelledby="steps-heading" className="mt-10 lg:mt-0">
                <h2 id="steps-heading" className="text-3xl font-black tracking-tight [font-stretch:80%]">
                  Steps
                </h2>
                <ol className="mt-4 border-t-2 border-foreground">
                  {view.steps.map((step, i) => (
                    <li key={step.id} className="flex gap-4 border-b-2 border-foreground py-5 lg:py-6">
                      <span aria-hidden className="grid size-9 shrink-0 place-items-center bg-foreground font-mono text-sm font-semibold text-background tabular-nums">
                        {i + 1}
                      </span>
                      <div className="min-w-0 flex-1 space-y-2 pt-0.5">
                        <p className="max-w-[65ch] text-[1.05rem] leading-relaxed lg:text-lg lg:leading-relaxed">{step.text}</p>
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
              </section>

              {recipe.notes.length ? (
                <section aria-labelledby="notes-heading" className="mt-10">
                  <h2 id="notes-heading" className="text-3xl font-black tracking-tight [font-stretch:80%]">
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
      <Checkbox id={id} checked={checked} onCheckedChange={(v) => onChecked(v === true)} className="size-6 rounded-md [&_svg]:size-4" />
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
    <section aria-labelledby="sources-heading" className="mt-12 space-y-5 border-2 border-foreground bg-card p-5 text-[0.95rem]">
      <h2 id="sources-heading" className="text-2xl font-black tracking-tight [font-stretch:80%]">
        Where this recipe comes from
      </h2>
      <ul className="space-y-1.5">
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

      {recipe.gaps.length ? (
        <div className="space-y-1.5">
          <h3 className="label-mono text-muted-foreground">Not given by the creator</h3>
          <ul className="space-y-1">
            {recipe.gaps.map((g) => (
              <li key={g}>{g}</li>
            ))}
          </ul>
        </div>
      ) : null}

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
        <h3 className="label-mono text-muted-foreground">What the labels mean</h3>
        <dl className="grid gap-1.5">
          <Legend term={LABEL_TEXT.confirmed} className="text-confirmed">Said or written by the creator. Shown without a label.</Legend>
          <Legend term={LABEL_TEXT.suggested} className="text-suggested">Worked out from the video, not stated. Worth a double-check.</Legend>
          <Legend term={LABEL_TEXT.not_specified} className="h-fit w-fit border-2 border-foreground bg-missing-bg px-1 text-missing-ink">The creator didn&apos;t say. Add your own if you like.</Legend>
          <Legend term={LABEL_TEXT.edited} className="text-foreground underline decoration-accent decoration-2 underline-offset-2">Your own amount. The original is kept, so you can switch back.</Legend>
        </dl>
      </div>
    </section>
  );
}

function Legend({ term, className, children }: { term: string; className: string; children: React.ReactNode }) {
  return (
    <div className="sm:flex sm:gap-2">
      <dt className={cn("font-semibold", className)}>{term}</dt>
      <dd className="text-muted-foreground">{children}</dd>
    </div>
  );
}
