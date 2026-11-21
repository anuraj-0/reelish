import "server-only";
import { MAX_OUTPUT_TOKENS, MODEL } from "@/lib/budget";
import { env, requireEnv } from "@/lib/env";
import { isAbortError, PipelineError } from "@/lib/pipeline/errors";

/**
 * OpenRouter Chat Completions with the configuration that worked in the spike:
 * provider pinned to Google AI Studio (the only one that accepts YouTube URLs), no fallbacks,
 * minimal reasoning (mandatory on this model), JSON output, usage/cost reporting.
 */
const PROVIDER = { order: ["google-ai-studio"], allow_fallbacks: false };

export type ChatPart = { type: "text"; text: string } | { type: "video_url"; video_url: { url: string; processing?: "static" } };

export type ChatResult = {
  content: string;
  finishReason: string | null;
  provider: string | null;
  model: string;
  latencyMs: number;
  usage: { inputTokens: number | null; outputTokens: number | null; videoTokens: number | null; costUsd: number | null };
};

type ApiError = { code?: number | string; message?: string; metadata?: unknown };

function mapHttpError(status: number, error: ApiError | undefined): PipelineError {
  const message = `OpenRouter ${status}: ${(error?.message ?? "no message").slice(0, 300)}`;
  if (status === 402) return new PipelineError("limited", message);
  if (status === 408 || status === 429 || status >= 500) return new PipelineError("upstream_failed", message, { retryable: true });
  // A 400 about the media means Gemini couldn't open this video; retrying won't help.
  if (status === 400 && /video|youtube|media|file|url|uri|permission|access/i.test(error?.message ?? "")) {
    return new PipelineError("unavailable", message);
  }
  return new PipelineError("upstream_failed", message, { retryable: false });
}

export async function chat(parts: ChatPart[], opts: { signal?: AbortSignal; timeoutMs: number; maxTokens?: number }): Promise<ChatResult> {
  const key = requireEnv("OPENROUTER_API_KEY");
  const body = {
    model: MODEL,
    provider: PROVIDER,
    messages: [{ role: "user", content: parts }],
    response_format: { type: "json_object" },
    reasoning: { effort: "minimal" },
    max_tokens: opts.maxTokens ?? MAX_OUTPUT_TOKENS,
    usage: { include: true },
  };
  const signal = opts.signal ? AbortSignal.any([opts.signal, AbortSignal.timeout(opts.timeoutMs)]) : AbortSignal.timeout(opts.timeoutMs);
  const started = Date.now();
  let res: Response;
  try {
    res = await fetch(`${env().OPENROUTER_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "X-Title": "Reelish" },
      body: JSON.stringify(body),
      signal,
      cache: "no-store",
    });
  } catch (e) {
    throw new PipelineError("upstream_failed", isAbortError(e) ? "OpenRouter timed out" : "OpenRouter network error", { retryable: true, cause: e });
  }

  let json: {
    error?: ApiError;
    provider?: string;
    model?: string;
    choices?: { finish_reason?: string | null; message?: { content?: string | null }; error?: ApiError }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number; prompt_tokens_details?: { video_tokens?: number } };
  };
  try {
    json = await res.json();
  } catch (e) {
    if (isAbortError(e)) throw new PipelineError("upstream_failed", "OpenRouter timed out", { retryable: true, cause: e });
    throw new PipelineError("upstream_failed", `OpenRouter ${res.status}: response was not JSON`, { retryable: res.status >= 500 });
  }
  const latencyMs = Date.now() - started;

  if (!res.ok) throw mapHttpError(res.status, json.error);
  // Errors can also arrive with HTTP 200 (provider failed after OpenRouter accepted the request).
  const choice = json.choices?.[0];
  const inlineError = json.error ?? choice?.error;
  if (inlineError) throw mapHttpError(typeof inlineError.code === "number" ? inlineError.code : 502, inlineError);
  const content = choice?.message?.content ?? "";
  if (!content.trim()) {
    throw new PipelineError("upstream_failed", `OpenRouter returned no content (finish_reason ${choice?.finish_reason ?? "none"})`, {
      retryable: choice?.finish_reason !== "content_filter",
    });
  }

  return {
    content,
    finishReason: choice?.finish_reason ?? null,
    provider: json.provider ?? null,
    model: json.model ?? MODEL,
    latencyMs,
    usage: {
      inputTokens: json.usage?.prompt_tokens ?? null,
      outputTokens: json.usage?.completion_tokens ?? null,
      videoTokens: json.usage?.prompt_tokens_details?.video_tokens ?? null,
      costUsd: typeof json.usage?.cost === "number" ? json.usage.cost : null,
    },
  };
}

/** The model sometimes wraps JSON in ``` fences despite json_object mode. */
export function parseJsonContent(content: string): unknown {
  let text = content.trim();
  if (text.startsWith("```")) text = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  return JSON.parse(text);
}
