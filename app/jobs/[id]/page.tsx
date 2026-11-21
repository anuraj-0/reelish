import type { Metadata } from "next";
import { Suspense } from "react";
import { Brand } from "@/components/brand";
import { JobProgress } from "@/components/job-progress";

export const metadata: Metadata = { title: "Getting your recipe ready", robots: { index: false } };

export default function JobPage({ params }: PageProps<"/jobs/[id]">) {
  return (
    <div className="mx-auto w-full max-w-xl flex-1 px-5 pt-5 pb-16">
      <header>
        <Brand />
      </header>
      <main className="pt-12">
        <Suspense fallback={null}>
          {params.then(({ id }) => (
            <JobProgress jobId={id} />
          ))}
        </Suspense>
      </main>
    </div>
  );
}
