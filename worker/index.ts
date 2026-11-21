/**
 * Background worker: `npm run worker` (dev) / systemd unit `reelish-worker` (VPS).
 * Loads the same env files as Next.js (.env.local overrides .env); values are never printed.
 * Configuration is read lazily, so loading the files here, after the imports, is in time.
 */
import fs from "node:fs";
import { getDb } from "@/lib/db";
import { env, pipelineMode } from "@/lib/env";
import { startWorker } from "@/lib/jobs/worker";
import { log } from "@/lib/log";

for (const file of [".env.local", ".env"]) if (fs.existsSync(file)) process.loadEnvFile(file);

if (pipelineMode() !== "live") {
  const missing = (["YOUTUBE_API_KEY", "OPENROUTER_API_KEY"] as const).filter((k) => !env()[k]);
  log("worker_not_started", { reason: "pipeline is in fixtures mode", missing }, "warn");
  process.exit(1);
}

const worker = startWorker(getDb());
let stopping = false;
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    if (stopping) return;
    stopping = true;
    log("worker_stopping", { signal });
    void worker.stop().then(() => process.exit(0));
  });
}
