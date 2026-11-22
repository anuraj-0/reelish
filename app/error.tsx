"use client";

import { Button } from "@/components/ui/button";

export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="mx-auto w-full max-w-xl flex-1 space-y-4 px-5 pt-24">
      <h1 className="text-4xl leading-none font-black tracking-tight uppercase [font-stretch:75%] sm:text-5xl">Something went wrong</h1>
      <p className="text-muted-foreground">Sorry, this page hit an error. Your saved amounts and progress are kept on this device.</p>
      <Button size="xl" onClick={reset}>
        Try again
      </Button>
    </main>
  );
}
