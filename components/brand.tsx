import Link from "next/link";

export function Brand({ className = "" }: { className?: string }) {
  return (
    <Link
      href="/"
      className={`inline-flex items-center gap-2 font-heading text-xl font-extrabold tracking-tight outline-none [font-stretch:85%] focus-visible:ring-3 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background ${className}`}
    >
      <span aria-hidden className="grid size-8 place-items-center border-2 border-foreground bg-accent font-mono text-base font-semibold text-accent-foreground">
        R
      </span>
      Reelish
    </Link>
  );
}
