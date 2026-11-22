import type { Metadata } from "next";
import { io } from "next/cache";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { RecipeOverview } from "@/components/recipe/recipe-overview";
import { Skeleton } from "@/components/ui/skeleton";
import { getRecipe } from "@/lib/jobs/service";

export async function generateMetadata({ params }: PageProps<"/r/[id]">): Promise<Metadata> {
  const { id } = await params;
  await io(); // synchronous database read follows
  return { title: getRecipe(id)?.title ?? "Recipe" };
}

export default function RecipePage({ params }: PageProps<"/r/[id]">) {
  return (
    <Suspense fallback={<RecipeSkeleton />}>
      {params.then(async ({ id }) => {
        await io();
        const recipe = getRecipe(id);
        if (!recipe) notFound();
        return <RecipeOverview recipe={recipe} />;
      })}
    </Suspense>
  );
}

function RecipeSkeleton() {
  return (
    <div className="mx-auto w-full max-w-2xl space-y-4 px-5 pt-20" aria-busy="true" aria-label="Loading recipe">
      <Skeleton className="aspect-video w-full" />
      <Skeleton className="h-9 w-3/4" />
      <Skeleton className="h-5 w-1/2" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}
