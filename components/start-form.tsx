"use client";

import { ArrowRight, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { START_ERROR_TEXT, type StartError } from "@/lib/jobs/types";
import { parseVideoUrl, URL_ERROR_TEXT, type UrlError } from "@/lib/url";

export type Example = { url: string; title: string; detail: string; platform: string };

function errorText(code: string | undefined): string {
  if (code && code in URL_ERROR_TEXT) return URL_ERROR_TEXT[code as UrlError];
  if (code && code in START_ERROR_TEXT) return START_ERROR_TEXT[code as StartError];
  return "Something went wrong. Please try again.";
}

export function StartForm({ examples, note }: { examples: Example[]; note: string }) {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  /** "form", or the URL of the example being started. */
  const [submitting, setSubmitting] = useState<string | null>(null);
  const inputId = useId();
  const errorId = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  // A link pasted before the page finished loading is in the field but not in React state yet.
  useEffect(() => {
    const typed = inputRef.current?.value;
    if (typed) setUrl(typed);
  }, []);

  async function start(value: string, source: string) {
    // Validate in the browser first for instant feedback; the server validates again.
    const parsed = parseVideoUrl(value);
    if (!parsed.ok) {
      setError(URL_ERROR_TEXT[parsed.error]);
      return;
    }
    setError(null);
    setSubmitting(source);
    try {
      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: value }),
      });
      const body = (await res.json().catch(() => ({}))) as { jobId?: string; recipeId?: string; error?: string };
      // Already made: go straight to the recipe.
      if (res.ok && body.recipeId) return router.push(`/r/${body.recipeId}`);
      if (!res.ok || !body.jobId) {
        setError(errorText(body.error));
        setSubmitting(null);
        return;
      }
      router.push(`/jobs/${body.jobId}`);
    } catch {
      setError("We couldn't reach Reelish. Check your connection and try again.");
      setSubmitting(null);
    }
  }

  return (
    <div className="space-y-8">
      {/* Works before hydration too (slow phones): the browser posts to /start, which redirects. */}
      <form
        method="post"
        action="/start"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          // Read the field itself: it's the truth even if state hasn't caught up (see above).
          void start(inputRef.current?.value ?? url, "form");
        }}
        className="space-y-2"
      >
        <label htmlFor={inputId} className="text-sm font-medium">
          Video link
        </label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            id={inputId}
            ref={inputRef}
            name="url"
            type="url"
            inputMode="url"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="https://www.instagram.com/reel/…"
            value={url}
            onChange={(e) => {
              setUrl(e.target.value);
              if (error) setError(null);
            }}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? errorId : undefined}
            className="h-12 rounded-xl bg-card px-4 text-base md:text-base"
          />
          <Button type="submit" size="xl" disabled={submitting !== null} className="sm:w-auto">
            {submitting === "form" ? <Loader2 className="animate-spin" aria-hidden /> : null}
            Get the recipe
            {submitting !== "form" ? <ArrowRight aria-hidden /> : null}
          </Button>
        </div>
        <p id={errorId} role="alert" className="min-h-5 text-sm text-destructive">
          {error}
        </p>
      </form>

      <section aria-labelledby="examples-heading" className="space-y-3">
        <div>
          <h2 id="examples-heading" className="text-lg font-semibold">
            Try an example
          </h2>
          <p className="text-sm text-muted-foreground">{note}</p>
        </div>
        <ul className="grid gap-2 sm:grid-cols-2">
          {examples.map((ex) => (
            <li key={ex.url}>
              <button
                type="button"
                onClick={() => {
                  setUrl(ex.url);
                  void start(ex.url, ex.url);
                }}
                disabled={submitting !== null}
                className="group flex min-h-16 w-full items-center justify-between gap-3 rounded-xl border bg-card px-4 py-3 text-left transition-colors outline-none hover:border-primary/40 hover:bg-accent/40 focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60"
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium">{ex.title}</span>
                  <span className="block text-sm text-muted-foreground">
                    {ex.platform} · {ex.detail}
                  </span>
                </span>
                {submitting === ex.url ? (
                  <Loader2 className="size-5 shrink-0 animate-spin text-muted-foreground" aria-label="Starting" />
                ) : (
                  <ArrowRight className="size-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden />
                )}
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
