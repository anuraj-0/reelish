import Link from "next/link";

export function Brand({ className = "" }: { className?: string }) {
  return (
    <Link href="/" className={`inline-flex items-center gap-2 rounded-md font-heading text-xl font-semibold tracking-tight outline-none focus-visible:ring-3 focus-visible:ring-ring/50 ${className}`}>
      <span aria-hidden className="grid size-7 place-items-center rounded-lg bg-primary text-[0.95rem] font-bold text-primary-foreground">R</span>
      Reelish
    </Link>
  );
}
