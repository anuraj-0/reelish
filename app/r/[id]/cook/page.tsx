import type { Metadata } from "next";
import { io } from "next/cache";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { CookMode } from "@/components/cook/cook-mode";
import { getRecipe } from "@/lib/jobs/service";

export async function generateMetadata({ params }: PageProps<"/r/[id]/cook">): Promise<Metadata> {
  const { id } = await params;
  await io();
  const title = getRecipe(id)?.title;
  return { title: title ? `Cooking: ${title}` : "Cook Mode" };
}

export default function CookPage({ params }: PageProps<"/r/[id]/cook">) {
  return (
    <Suspense fallback={null}>
      {params.then(async ({ id }) => {
        await io();
        const recipe = getRecipe(id);
        if (!recipe) notFound();
        return <CookMode recipe={recipe} />;
      })}
    </Suspense>
  );
}
