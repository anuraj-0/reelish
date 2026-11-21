import type { JobErrorCode } from "@/lib/jobs/types";

/**
 * A failure with a user-facing meaning. `retryable` is for the worker's automatic retry:
 * only transient upstream problems are retried (bounded by the job's max attempts).
 */
export class PipelineError extends Error {
  readonly code: JobErrorCode;
  readonly retryable: boolean;
  constructor(code: JobErrorCode, message: string, opts: { retryable?: boolean; cause?: unknown } = {}) {
    super(message, { cause: opts.cause });
    this.name = "PipelineError";
    this.code = code;
    this.retryable = opts.retryable ?? code === "upstream_failed";
  }
}

export function isAbortError(e: unknown): boolean {
  return e instanceof Error && (e.name === "AbortError" || e.name === "TimeoutError");
}
