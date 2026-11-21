import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { RecipeOverview } from "@/components/recipe/recipe-overview";
import { Skeleton } from "@/components/ui/skeleton";
import { getFixtureRecipe } from "@/lib/fixtures";

export async function generateMetadata({ params }: PageProps<"/r/[id]">): Promise<Metadata> {
  const { id } = await params;
  return { title: getFixtureRecipe(id)?.title ?? "Recipe" };
}

export default function RecipePage({ params }: PageProps<"/r/[id]">) {
  return (
    <Suspense fallback={<RecipeSkeleton />}>
      {params.then(({ id }) => {
        // M1: saved test recipes. M2 reads from the database.
        const recipe = getFixtureRecipe(id);
        if (!recipe) notFound();
        return <RecipeOverview recipe={recipe} />;
      })}
    </Suspense>
  );
}

function RecipeSkeleton() {
  return (
    <div className="mx-auto w-full max-w-2xl space-y-4 px-5 pt-20" aria-busy="true" aria-label="Loading recipe">
      <Skeleton className="aspect-video w-full rounded-2xl" />
      <Skeleton className="h-9 w-3/4" />
      <Skeleton className="h-5 w-1/2" />
      <Skeleton className="h-64 w-full rounded-2xl" />
    </div>
  );
}
