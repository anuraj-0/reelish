import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { CookMode } from "@/components/cook/cook-mode";
import { getFixtureRecipe } from "@/lib/fixtures";

export async function generateMetadata({ params }: PageProps<"/r/[id]/cook">): Promise<Metadata> {
  const { id } = await params;
  const title = getFixtureRecipe(id)?.title;
  return { title: title ? `Cooking: ${title}` : "Cook Mode" };
}

export default function CookPage({ params }: PageProps<"/r/[id]/cook">) {
  return (
    <Suspense fallback={null}>
      {params.then(({ id }) => {
        const recipe = getFixtureRecipe(id);
        if (!recipe) notFound();
        return <CookMode recipe={recipe} />;
      })}
    </Suspense>
  );
}
