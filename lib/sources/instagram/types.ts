/**
 * What the Instagram pipeline needs, independent of who provides it. Today the only provider is
 * Supadata (unofficial, scraping-based; see docs/PLATFORM-CONSTRAINTS.md). Replacing it means
 * writing another `InstagramProvider`; nothing else changes.
 */

export type ReelDetails = {
  shortcode: string;
  /** The creator's caption ("" when empty). */
  caption: string;
  creatorName: string | null;
  creatorHandle: string | null;
  durationSec: number | null;
  isVideo: boolean;
};

export type TranscriptSegment = { startSec: number; text: string };

/** A paid call's result plus what it actually cost. */
export type Paid<T> = { value: T; credits: number | null; latencyMs: number };

export type InstagramProvider = {
  name: string;
  /** Worst-case credits, used to reserve budget before each call. */
  worstCredits: { details: number; transcript: (durationSec: number | null) => number; visual: (durationSec: number | null) => number };
  getDetails(reelUrl: string, signal: AbortSignal): Promise<Paid<ReelDetails>>;
  /** Spoken words with start times; [] when nobody speaks. `resume` continues an async job after a restart. */
  getTranscript(reelUrl: string, signal: AbortSignal, resume: ResumeStore): Promise<Paid<{ lang: string | null; segments: TranscriptSegment[] }>>;
  /** Free-text notes about what's shown (on-screen text, visible amounts). */
  getVisualNotes(reelUrl: string, signal: AbortSignal, resume: ResumeStore): Promise<Paid<string>>;
};

/** Remembers a provider's async job id so a retried or restarted job polls it instead of paying again. */
export type ResumeStore = { get(): string | null; set(jobId: string): void; clear(): void };
