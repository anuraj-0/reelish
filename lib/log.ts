/**
 * Structured logs: one JSON object per line on stdout (journald collects them on the VPS).
 * Every line passes through `redact`, which removes the values of secret environment
 * variables wherever they appear. Never log request bodies, descriptions or client addresses.
 */
const SECRET_NAMES = ["OPENROUTER_API_KEY", "YOUTUBE_API_KEY", "SUPADATA_API_KEY"];

export function redact(text: string, env: Record<string, string | undefined> = process.env): string {
  let out = text;
  for (const name of SECRET_NAMES) {
    const value = env[name];
    if (value && value.length >= 8) out = out.split(value).join("[redacted]");
  }
  return out;
}

export function log(event: string, fields: Record<string, unknown> = {}, level: "info" | "warn" | "error" = "info") {
  if (process.env.REELISH_LOG === "silent") return;
  const line = redact(JSON.stringify({ ts: new Date().toISOString(), level, event, ...fields }));
  (level === "error" ? console.error : console.log)(line);
}
