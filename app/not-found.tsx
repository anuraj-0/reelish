import Link from "next/link";
import { Brand } from "@/components/brand";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="mx-auto w-full max-w-xl flex-1 px-5 pt-5">
      <header>
        <Brand />
      </header>
      <main className="space-y-4 pt-16">
        <h1 className="text-4xl leading-none font-black tracking-tight uppercase [font-stretch:75%] sm:text-5xl">We can&apos;t find that recipe</h1>
        <p className="text-muted-foreground">The link may be wrong or out of date. Paste the video link again to make it.</p>
        <Button asChild size="xl">
          <Link href="/">Paste a link</Link>
        </Button>
      </main>
    </div>
  );
}
