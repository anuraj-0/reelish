"use client";

import { ArrowRight, Loader2, UtensilsCrossed } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { basePath } from "@/lib/base-path";
import { START_ERROR_TEXT, type StartError } from "@/lib/jobs/types";
import { parseVideoUrl, URL_ERROR_TEXT, type UrlError } from "@/lib/url";
import { cn } from "@/lib/utils";

export type Example = { url: string; title: string; detail: string; platform: string; thumbnail: string | null };

function errorText(code: string | undefined): string {
  if (code && code in URL_ERROR_TEXT) return URL_ERROR_TEXT[code as UrlError];
  if (code && code in START_ERROR_TEXT) return START_ERROR_TEXT[code as StartError];
  return "Something went wrong. Please try again.";
}

const FOCUS = "outline-none focus-visible:ring-3 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

export function StartForm({ featured, more, trust }: { featured: Example[]; more: Example[]; trust: string }) {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  /** "form", or the URL of the example being started. */
  const [submitting, setSubmitting] = useState<string | null>(null);
  const inputId = useId();
  const errorId = useId();
  const helpId = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  // A link pasted before the page finished loading is in the field but not in React state yet.
  useEffect(() => {
    const typed = inputRef.current?.value;
    if (typed) setUrl(typed);
  }, []);

  // Cache Components keeps this page alive (hidden) after we navigate away, so Back would show it
  // still "starting" with every button disabled. The cleanup runs when the page is hidden.
  useLayoutEffect(() => () => setSubmitting(null), []);

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
      const res = await fetch(`${basePath}/api/jobs`, {
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

  const startExample = (ex: Example) => {
    if (submitting !== null) return;
    setUrl(ex.url);
    void start(ex.url, ex.url);
  };

  return (
    <>
      {/* Works before hydration too (slow phones): the browser posts to /start, which redirects. */}
      <form
        method="post"
        action={`${basePath}/start`}
        noValidate
        aria-busy={submitting === "form"}
        onSubmit={(e) => {
          e.preventDefault();
          if (submitting !== null) return; // no double submits
          // Read the field itself: it's the truth even if state hasn't caught up (see above).
          void start(inputRef.current?.value ?? url, "form");
        }}
        className="mt-8 max-w-3xl"
      >
        <label htmlFor={inputId} className="sr-only">
          Video link
        </label>
        <div className="flex flex-col gap-3 sm:brut-shadow sm:flex-row sm:gap-0">
          <Input
            id={inputId}
            ref={inputRef}
            name="url"
            type="url"
            inputMode="url"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            enterKeyHint="go"
            placeholder="Paste a video link"
            value={url}
            onChange={(e) => {
              setUrl(e.target.value);
              if (error) setError(null);
            }}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? `${errorId} ${helpId}` : helpId}
            className="h-15 px-4 text-lg placeholder:text-muted-foreground md:text-lg sm:border-r-0"
          />
          <Button type="submit" size="xl" disabled={submitting !== null} className="h-15 px-6 text-lg sm:w-auto sm:shadow-none">
            {submitting === "form" ? (
              <>
                <Loader2 className="animate-spin" aria-hidden /> Getting recipe…
              </>
            ) : (
              <>
                Get my recipe <ArrowRight aria-hidden />
              </>
            )}
          </Button>
        </div>
        <p id={errorId} role="alert" className={cn("text-sm font-medium text-destructive", error ? "mt-2" : "sr-only")}>
          {error}
        </p>
        <p id={helpId} className="mt-3 text-sm text-muted-foreground">
          {trust}
        </p>
        <p role="status" className="sr-only">
          {submitting ? "Starting your recipe…" : ""}
        </p>
      </form>

      <section aria-labelledby="examples-heading" className="mt-14 sm:mt-16">
        <h2 id="examples-heading" className="text-2xl font-black tracking-tight sm:text-3xl">
          Try one of these recipes
        </h2>
        <ul className="mt-5 grid gap-4 sm:grid-cols-3 sm:gap-5">
          {featured.map((ex) => (
            <li key={ex.url}>
              <ExampleCard example={ex} busy={submitting === ex.url} disabled={submitting !== null} onStart={() => startExample(ex)} />
            </li>
          ))}
        </ul>
        {more.length ? (
          <div className="mt-6 text-sm">
            <h3 className="label-mono text-muted-foreground">More examples</h3>
            <ul className="mt-1 flex flex-col sm:flex-row sm:flex-wrap sm:gap-x-6">
              {more.map((ex) => (
                <li key={ex.url}>
                  <button
                    type="button"
                    onClick={() => startExample(ex)}
                    disabled={submitting !== null}
                    className={cn("flex min-h-11 flex-wrap items-center gap-x-2 py-1.5 text-left disabled:opacity-60", FOCUS)}
                  >
                    <span className="font-semibold whitespace-nowrap underline decoration-accent decoration-2 underline-offset-4">{ex.title}</span>
                    <span className="text-muted-foreground">
                      {ex.platform} · {ex.detail}
                    </span>
                    {submitting === ex.url ? <Loader2 className="size-4 shrink-0 animate-spin" aria-label="Starting" /> : null}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>
    </>
  );
}

/**
 * The whole card is one button: thumbnail, title, source. A compact row on phones, stacked from sm up.
 * The frame is always 16:9: YouTube's stills are 4:3 with black bars, and 16:9 crops exactly those bars.
 */
function ExampleCard({ example: ex, busy, disabled, onStart }: { example: Example; busy: boolean; disabled: boolean; onStart: () => void }) {
  return (
    <button
      type="button"
      onClick={onStart}
      disabled={disabled}
      className={cn(
        "group brut-shadow-sm brut-press flex h-full w-full items-center gap-4 border-2 border-foreground bg-card p-3 text-left hover:bg-accent disabled:opacity-60 disabled:shadow-none sm:flex-col sm:items-stretch sm:gap-0 sm:p-0",
        FOCUS,
      )}
    >
      <span className="relative block aspect-video w-32 shrink-0 overflow-hidden border-2 border-foreground bg-secondary sm:w-full sm:border-0 sm:border-b-2">
        {ex.thumbnail ? (
          <Image src={ex.thumbnail} alt="" fill sizes="(max-width: 639px) 128px, 360px" className="object-cover transition-transform duration-300 group-hover:scale-[1.03]" />
        ) : (
          <span aria-hidden className="absolute inset-0 grid place-items-center text-muted-foreground group-hover:text-foreground">
            <UtensilsCrossed className="size-7 sm:size-10" strokeWidth={1.5} />
          </span>
        )}
        {busy ? (
          <span className="absolute inset-0 grid place-items-center bg-background/75">
            <Loader2 className="size-7 animate-spin" aria-label="Starting" />
          </span>
        ) : null}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1 sm:px-4 sm:py-3.5">
        <span className="label-mono text-muted-foreground group-hover:text-foreground">{ex.platform}</span>
        <span className="text-lg leading-snug font-extrabold">{ex.title}</span>
        <span className="text-sm text-muted-foreground group-hover:text-foreground">{ex.detail}</span>
      </span>
    </button>
  );
}
