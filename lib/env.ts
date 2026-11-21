import "server-only";
import { z } from "zod";

// Server-only configuration. Never import this from a client component, and never
// prefix secrets with NEXT_PUBLIC_ (that would ship them to the browser).
// Keys are optional until the live pipeline lands (M2/M3); each source module
// will call requireEnv() for the keys it needs.
const EnvSchema = z.object({
  OPENROUTER_API_KEY: z.string().min(1).optional(),
  YOUTUBE_API_KEY: z.string().min(1).optional(),
  SUPADATA_API_KEY: z.string().min(1).optional(),
  INSTAGRAM_ENABLED: z
    .enum(["true", "false"])
    .default("true")
    .transform((v) => v === "true"),
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

export function requireEnv<K extends keyof Env>(name: K): NonNullable<Env[K]> {
  const value = env()[name];
  if (value === undefined || value === null) {
    throw new Error(`Missing required environment variable ${String(name)}`);
  }
  return value as NonNullable<Env[K]>;
}
