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
      <header className="border-b-2 border-foreground">
        <div className="mx-auto flex w-full max-w-4xl items-center justify-between gap-4 px-5 py-4">
          <Brand />
          <p className="label-mono hidden text-muted-foreground sm:block">Video link → recipe → cook</p>
        </div>
      </header>
      <main className="mx-auto w-full max-w-4xl flex-1 px-5 pt-10 pb-16 sm:pt-16">
        <p className="label-mono text-muted-foreground">YouTube · Instagram Reels</p>
        <h1 className="mt-3 max-w-[14ch] text-[2.75rem] leading-[0.95] font-black tracking-[-0.03em] uppercase [font-stretch:75%] sm:text-7xl">
          Cook from the video, <span className="bg-accent px-1 box-decoration-clone">not around it.</span>
        </h1>
        <p className="mt-6 max-w-[52ch] text-lg leading-relaxed text-muted-foreground">
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
        <ul className="mt-16 grid border-2 border-foreground bg-card sm:grid-cols-3">
          {POINTS.map(({ icon: Icon, title, body }, i) => (
            <li key={title} className="space-y-2 border-foreground p-5 not-last:border-b-2 sm:not-last:border-r-2 sm:not-last:border-b-0">
              <div className="flex items-center justify-between">
                <span className="label-mono text-muted-foreground">{String(i + 1).padStart(2, "0")}</span>
                <Icon className="size-5" aria-hidden />
              </div>
              <h2 className="text-lg leading-tight font-extrabold">{title}</h2>
              <p className="text-sm leading-relaxed text-muted-foreground">{body}</p>
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}
