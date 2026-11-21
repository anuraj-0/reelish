/**
 * Free dry run for a YouTube URL: fetches video details (Data API, 1 quota unit) and the linked
 * recipe page, builds the exact AI request, and prints its worst-case cost. Makes no AI call.
 *   npm run estimate -- <youtube url> [...more urls]
 */
import fs from "node:fs";
import { worstCaseUsd } from "@/lib/budget";
import { openDb } from "@/lib/db";
import { PIPELINE_VERSION, type JobRow } from "@/lib/jobs/store";
import { buildParts } from "@/lib/pipeline/youtube";
import { fetchLinkedRecipe, renderLinkedRecipe } from "@/lib/sources/linked-recipe";
import { fetchYoutubeVideo } from "@/lib/sources/youtube";
import { parseVideoUrl } from "@/lib/url";

for (const file of [".env.local", ".env"]) if (fs.existsSync(file)) process.loadEnvFile(file);

async function main() {
const db = openDb(":memory:");
for (const raw of process.argv.slice(2)) {
  const parsed = parseVideoUrl(raw);
  if (!parsed.ok || parsed.value.platform !== "youtube") {
    console.log(JSON.stringify({ url: raw, error: parsed.ok ? "not youtube" : parsed.error }));
    continue;
  }
  try {
    const video = await fetchYoutubeVideo(parsed.value.videoId);
    const linked = await fetchLinkedRecipe(video, { db });
    const job = { url: parsed.value.canonicalUrl, video_id: video.videoId, pipeline_version: PIPELINE_VERSION } as JobRow;
    const description = video.description.trim() ? video.description.slice(0, 5000) : null;
    const parts = buildParts(job, video, description, linked.recipe ? renderLinkedRecipe(linked.recipe) : null);
    const textChars = parts.reduce((n, p) => n + (p.type === "text" ? p.text.length : 0), 0);
    console.log(
      JSON.stringify({
        url: parsed.value.canonicalUrl,
        title: video.title,
        durationSec: video.durationSec,
        textChars,
        linked: { candidates: linked.candidates, attempts: linked.attempts, found: linked.recipe?.url ?? null, ingredients: linked.recipe?.ingredients.length ?? 0 },
        worstCaseUsd: Number(worstCaseUsd({ videoSeconds: video.durationSec, textChars }).toFixed(4)),
        expectedUsd: Number((((video.durationSec * 95 + 3000 + textChars / 3.5) * 0.3e-6) + 2000 * 2.5e-6).toFixed(4)),
      }),
    );
  } catch (e) {
    console.log(JSON.stringify({ url: raw, error: (e as Error).message }));
  }
}
}

void main();
