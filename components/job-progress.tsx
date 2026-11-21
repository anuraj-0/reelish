"use client";

import { Check, Circle, ExternalLink, Loader2, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { PLATFORM_NAME } from "@/lib/format";
import { JOB_ERROR_TEXT, JobStatus, STAGE_LABEL } from "@/lib/jobs/types";
import { cn } from "@/lib/utils";

const POLL_MS = 1200;
const SLOW_AFTER_S = 15;

type Fetched = { kind: "loading" } | { kind: "ok"; job: JobStatus } | { kind: "missing" } | { kind: "offline" };

export function JobProgress({ jobId }: { jobId: string }) {
  const router = useRouter();
  const [data, setData] = useState<Fetched>({ kind: "loading" });
  const [now, setNow] = useState(() => Date.now());
  const redirected = useRef(false);

  useEffect(() => {
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      try {
        const res = await fetch(`/api/jobs/${jobId}`, { cache: "no-store" });
        if (stop) return;
        if (res.status === 404) return setData({ kind: "missing" });
        const job = JobStatus.parse(await res.json());
        setData({ kind: "ok", job });
        setNow(Date.now());
        if (job.status === "succeeded" && job.recipeId && !redirected.current) {
          redirected.current = true;
          router.replace(`/r/${job.recipeId}`);
          return;
        }
        if (job.status === "running" || job.status === "queued") timer = setTimeout(tick, POLL_MS);
      } catch {
        if (stop) return;
        setData({ kind: "offline" });
        timer = setTimeout(tick, POLL_MS * 2); // keep trying; the job runs on the server regardless
      }
    };
    void tick();
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, [jobId, router]);

  if (data.kind === "missing") {
    return (
      <State title="We can't find this request" body="It may have expired. Paste the link again to start over.">
        <Button asChild size="xl">
          <Link href="/">Paste a link</Link>
        </Button>
      </State>
    );
  }

  const job = data.kind === "ok" ? data.job : null;

  if (job?.status === "failed" && job.error) {
    const text = JOB_ERROR_TEXT[job.error];
    return (
      <State title={text.title} body={text.body}>
        <div className="flex flex-col gap-2 sm:flex-row">
          {text.retry ? <RetryButton url={job.sourceUrl} /> : null}
          <Button asChild size="xl" variant={text.retry ? "outline" : "default"}>
            <Link href="/">Try another link</Link>
          </Button>
          <Button asChild size="xl" variant="outline">
            <a href={job.sourceUrl} target="_blank" rel="noopener noreferrer nofollow">
              Open the video <ExternalLink aria-hidden />
            </a>
          </Button>
        </div>
        <StageList job={job} />
      </State>
    );
  }

  const elapsedS = job ? Math.max(0, Math.round((now - Date.parse(job.startedAt)) / 1000)) : 0;
  const active = job?.stages.find((s) => s.state === "active");

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <p className="text-sm font-medium text-muted-foreground">{job ? `${PLATFORM_NAME[job.platform]} video` : "Starting…"}</p>
        <h1 className="text-3xl font-semibold tracking-tight">Getting your recipe ready</h1>
        {/* Screen readers hear each new stage once, not every poll. */}
        <p aria-live="polite" className="text-muted-foreground">
          {data.kind === "offline"
            ? "Connection lost. We'll keep checking; your recipe is still being made."
            : active
              ? `${STAGE_LABEL[active.key]}…`
              : job?.status === "queued"
                ? "Waiting to start…"
                : job?.status === "succeeded"
                  ? "Done. Opening your recipe…"
                  : "Starting…"}
        </p>
      </div>
      {job ? <StageList job={job} /> : <div className="h-40" aria-hidden />}
      {job && elapsedS >= SLOW_AFTER_S ? (
        <p className="rounded-xl bg-muted px-4 py-3 text-sm text-muted-foreground">
          {job.platform === "instagram"
            ? "Instagram videos can take up to a minute. You can leave this page open; it'll update by itself."
            : "This is taking longer than usual. You can leave this page open; it'll update by itself."}
        </p>
      ) : null}
      <Button asChild variant="ghost" size="xl" className="-ml-3">
        <Link href="/">Cancel</Link>
      </Button>
    </div>
  );
}

/** Starts a fresh job for the same video. The server joins an existing one instead of duplicating it. */
function RetryButton({ url }: { url: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  return (
    <>
      <Button
        size="xl"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setFailed(false);
          try {
            const res = await fetch("/api/jobs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url }) });
            const body = (await res.json()) as { jobId?: string; recipeId?: string };
            if (body.recipeId) return router.replace(`/r/${body.recipeId}`);
            if (body.jobId) return router.replace(`/jobs/${body.jobId}`);
            throw new Error("no job");
          } catch {
            setFailed(true);
            setBusy(false);
          }
        }}
      >
        {busy ? <Loader2 className="animate-spin" aria-hidden /> : null} Try again
      </Button>
      {failed ? (
        <p role="alert" className="text-sm text-destructive sm:self-center">
          Couldn&apos;t start again. Please wait a moment.
        </p>
      ) : null}
    </>
  );
}

function StageList({ job }: { job: JobStatus }) {
  return (
    <ol className="space-y-1" aria-label="Progress">
      {job.stages.map((stage) => (
        <li
          key={stage.key}
          className={cn(
            "flex items-center gap-3 rounded-xl px-3 py-2.5",
            stage.state === "active" && "bg-card shadow-xs ring-1 ring-border",
            stage.state === "pending" && "text-muted-foreground",
          )}
        >
          <StageIcon state={stage.state} />
          <span className={cn(stage.state === "active" && "font-medium")}>{STAGE_LABEL[stage.key]}</span>
          <span className="sr-only">
            {{ done: "(done)", active: "(in progress)", pending: "(not started)", failed: "(failed)" }[stage.state]}
          </span>
        </li>
      ))}
    </ol>
  );
}

function StageIcon({ state }: { state: JobStatus["stages"][number]["state"] }) {
  const base = "size-6 shrink-0 rounded-full p-1";
  if (state === "done") return <Check className={cn(base, "bg-confirmed/15 text-confirmed")} aria-hidden />;
  if (state === "active") return <Loader2 className={cn(base, "animate-spin text-primary")} aria-hidden />;
  if (state === "failed") return <X className={cn(base, "bg-destructive/10 text-destructive")} aria-hidden />;
  return <Circle className={cn(base, "text-border")} aria-hidden />;
}

function State({ title, body, children }: { title: string; body: string; children: React.ReactNode }) {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
        <p className="text-muted-foreground">{body}</p>
      </div>
      {children}
    </div>
  );
}
