import { BookOpenCheck, CircleHelp, MonitorSmartphone } from "lucide-react";
import { Brand } from "@/components/brand";
import { StartForm, type Example } from "@/components/start-form";
import { thumbnailFor } from "@/lib/format";
import { instagramLive, pipelineMode } from "@/lib/env";

// Thumbnails are the videos' own stills. If Instagram won't serve a reel's, the card shows a plain fallback.
const yt = (id: string) => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
const ig = (id: string) => thumbnailFor({ platform: "instagram", videoId: id, thumbnailUrl: null });

// The live site shows recipes people have made there. The fixtures preview can only open its saved recipes.
const FEATURED_LIVE: Example[] = [
  { url: "https://www.youtube.com/watch?v=Mtrg3To4VCg", title: "Dhaba Style Dal Tadka", platform: "YouTube", detail: "Amounts from the creator", thumbnail: yt("Mtrg3To4VCg") },
  { url: "https://www.youtube.com/watch?v=KehYpqc1NTw", title: "Sooji Halwa", platform: "YouTube", detail: "Complete recipe", thumbnail: yt("KehYpqc1NTw") },
  { url: "https://www.instagram.com/reel/CjwyMyHJtcu/", title: "Paneer Butter Masala", platform: "Instagram", detail: "From a silent reel", thumbnail: ig("CjwyMyHJtcu") },
];

const FEATURED_PREVIEW: Example[] = [
  { url: "https://www.youtube.com/shorts/VTR8vxBFGDY", title: "Creamy Vegetable Soup", platform: "YouTube", detail: "Complete recipe", thumbnail: yt("VTR8vxBFGDY") },
  { url: "https://www.instagram.com/reel/DWZqrugEacU/", title: "Crispy Pasta Salad", platform: "Instagram", detail: "From an Instagram reel", thumbnail: ig("DWZqrugEacU") },
  { url: "https://www.youtube.com/shorts/s4na199iyag", title: "Kaju Katli Sparklers", platform: "YouTube", detail: "Recipe from a silent video", thumbnail: yt("s4na199iyag") },
];

const POINTS = [
  { icon: BookOpenCheck, title: "Based on the original video", body: "Ingredients and instructions drawn from the creator's video and available recipe details." },
  { icon: CircleHelp, title: "No made\u2011up measurements", body: "If an amount isn't provided, Reelish tells you instead of inventing one." },
  { icon: MonitorSmartphone, title: "Cook without constant rewinding", body: "Follow one clear step at a time with Cook Mode." },
];

/** Only claims the running deployment can keep. */
function trustLine(): string {
  if (pipelineMode() !== "live") return "No signup needed · This preview uses saved example recipes";
  return instagramLive() ? "No signup needed · Works with YouTube and Instagram" : "No signup needed · Works with YouTube (Instagram is switched off for now)";
}

export default function Home() {
  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b-2 border-foreground">
        <div className="mx-auto flex w-full max-w-5xl items-center px-5 py-4">
          <Brand />
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-5 pt-10 pb-16 sm:pt-16">
        <div className="max-w-3xl">
          <h1 className="text-[2.6rem] leading-[1.02] font-black tracking-[-0.025em] [font-stretch:80%] sm:text-6xl lg:text-7xl">
            Turn cooking videos into <span className="bg-accent px-1.5 box-decoration-clone">recipes.</span>
          </h1>
          <p className="mt-5 max-w-[48ch] text-lg leading-relaxed text-muted-foreground sm:text-xl sm:leading-relaxed">
            Paste a YouTube or Instagram cooking video. Get the ingredients, clear instructions, and a step-by-step cooking guide.
          </p>
        </div>
        <StartForm featured={pipelineMode() === "live" ? FEATURED_LIVE : FEATURED_PREVIEW} trust={trustLine()} />

        <section aria-labelledby="benefits-heading" className="mt-20 border-t-2 border-foreground pt-8">
          <h2 id="benefits-heading" className="text-2xl font-black tracking-tight sm:text-3xl">
            Made for cooking, not rewinding
          </h2>
          <ul className="mt-6 grid gap-8 sm:grid-cols-3 sm:gap-10">
            {POINTS.map(({ icon: Icon, title, body }) => (
              <li key={title} className="space-y-2">
                <Icon className="size-6" aria-hidden />
                <h3 className="text-lg leading-snug font-extrabold">{title}</h3>
                <p className="leading-relaxed text-muted-foreground">{body}</p>
              </li>
            ))}
          </ul>
        </section>
      </main>
      <footer className="border-t-2 border-foreground">
        <p className="mx-auto w-full max-w-5xl px-5 py-5 text-sm text-muted-foreground">
          Your checked-off ingredients, added amounts and Cook Mode progress are saved on this device only.
        </p>
      </footer>
    </div>
  );
}
