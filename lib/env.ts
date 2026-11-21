import "server-only";
import { z } from "zod";

// Server-only configuration. Never import this from a client component, and never
// prefix secrets with NEXT_PUBLIC_ (that would ship them to the browser).
// Keys are optional so the offline fixture mode works without them; each source module
// calls requireEnv() for the keys it needs.
const number = (fallback: number) => z.coerce.number().positive().default(fallback);

const EnvSchema = z.object({
  OPENROUTER_API_KEY: z.string().min(1).optional(),
  YOUTUBE_API_KEY: z.string().min(1).optional(),
  SUPADATA_API_KEY: z.string().min(1).optional(),
  INSTAGRAM_ENABLED: z
    .enum(["true", "false"])
    .default("true")
    .transform((v) => v === "true"),
  /** "live" runs real jobs; "fixtures" uses the saved test recipes (offline, used by e2e tests). */
  REELISH_PIPELINE: z.enum(["live", "fixtures"]).optional(),
  /** Spend cap for AI calls over any rolling 24 hours, in USD. */
  DAILY_AI_BUDGET_USD: number(1),
  /** Refuse a single AI call whose worst-case cost is above this. */
  MAX_JOB_COST_USD: number(0.12),
  /** New (uncached) recipe requests per visitor per hour. */
  RATE_LIMIT_PER_HOUR: number(10),
  /** Only trust X-Forwarded-For when a reverse proxy we control sets it (Nginx on the VPS). */
  TRUST_PROXY: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  // Overridable for tests against a local mock server.
  OPENROUTER_BASE_URL: z.url().default("https://openrouter.ai/api/v1"),
  YOUTUBE_API_BASE_URL: z.url().default("https://www.googleapis.com/youtube/v3"),
});

export type Env = z.infer<typeof EnvSchema>;

let cached: Env | undefined;

export function env(): Env {
  if (!cached) {
    const parsed = EnvSchema.safeParse(process.env);
    if (!parsed.success) {
      // Report which variables are invalid, never their values.
      const names = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
      throw new Error(`Invalid server environment: ${names}`);
    }
    cached = parsed.data;
  }
  return cached;
}

/** Tests change process.env between cases. */
export function resetEnvForTests() {
  cached = undefined;
}

export function requireEnv<K extends keyof Env>(name: K): NonNullable<Env[K]> {
  const value = env()[name];
  if (value === undefined || value === null) {
    throw new Error(`Missing required environment variable ${String(name)}`);
  }
  return value as NonNullable<Env[K]>;
}

/** Live processing needs both keys; without them (or when asked) we serve the saved fixtures. */
export function pipelineMode(): "live" | "fixtures" {
  const e = env();
  if (e.REELISH_PIPELINE) return e.REELISH_PIPELINE;
  return e.YOUTUBE_API_KEY && e.OPENROUTER_API_KEY ? "live" : "fixtures";
}
