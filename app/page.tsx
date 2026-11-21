import { BookOpenCheck, CircleHelp, MonitorSmartphone } from "lucide-react";
import { Brand } from "@/components/brand";
import { StartForm, type Example } from "@/components/start-form";
import { instagramLive, pipelineMode } from "@/lib/env";
import { DEMO_UNAVAILABLE_ID } from "@/lib/jobs/mock";

const EXAMPLES: Example[] = [
  { url: "https://www.youtube.com/shorts/VTR8vxBFGDY", title: "Creamy Vegetable Soup", platform: "YouTube", detail: "full recipe from the creator" },
  { url: "https://www.instagram.com/reel/DWZqrugEacU/", title: "Viral Crispy Pasta Salad", platform: "Instagram", detail: "recipe in the caption" },
  { url: "https://www.instagram.com/reel/DPeUV0GjQnF/", title: "Juicy Roast Turkey", platform: "Instagram", detail: "no amounts given" },
  { url: "https://www.youtube.com/shorts/s4na199iyag", title: "Kaju Katli Sparklers", platform: "YouTube", detail: "silent video" },
  { url: `https://www.youtube.com/watch?v=${DEMO_UNAVAILABLE_ID}`, title: "A private video", platform: "YouTube", detail: "shows what a failure looks like" },
];

const POINTS = [
  { icon: BookOpenCheck, title: "Uses the creator's own words", body: "What they say in the video, plus their caption, description or written recipe." },
  { icon: CircleHelp, title: "Never guesses amounts", body: "If the creator didn't say how much, it's marked Not specified so you can add your own." },
  { icon: MonitorSmartphone, title: "Cook Mode", body: "One step at a time, in big text, with the screen kept on." },
];

export default function Home() {
  return (
    <div className="flex flex-1 flex-col">
      <header className="mx-auto w-full max-w-3xl px-5 pt-5">
        <Brand />
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-5 pt-10 pb-16 sm:pt-16">
        <h1 className="max-w-[20ch] text-[2.4rem] leading-[1.05] font-semibold tracking-tight sm:text-6xl">
          Cook from the video, not around it.
        </h1>
        <p className="mt-4 max-w-[52ch] text-lg text-muted-foreground">
          Paste a YouTube or Instagram cooking video. Reelish turns it into a clear recipe and a step-by-step Cook Mode, and tells you
          honestly when something wasn&apos;t said.
        </p>
        <div className="mt-8">
          <StartForm
            examples={EXAMPLES}
            note={
              pipelineMode() !== "live"
                ? "This preview runs on saved test recipes. Live processing is switched off."
                : instagramLive()
                  ? "YouTube and Instagram links are read live. The private-video example shows what a failure looks like."
                  : "YouTube links are read live. The Instagram examples use saved test recipes while Instagram is switched off."
            }
          />
        </div>
        <ul className="mt-14 grid gap-6 border-t pt-8 sm:grid-cols-3">
          {POINTS.map(({ icon: Icon, title, body }) => (
            <li key={title} className="space-y-1.5">
              <Icon className="size-5 text-primary" aria-hidden />
              <h2 className="text-base font-semibold">{title}</h2>
              <p className="text-sm text-muted-foreground">{body}</p>
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}
