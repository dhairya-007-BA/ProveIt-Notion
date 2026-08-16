import Link from "next/link";

/** A deterministic in-app back destination; it never relies on browser history. */
export function BackButton({ href, label }: { href: string; label: string }) {
  return <Link href={href} className="proveit-back-link inline-flex min-h-10 items-center gap-2 rounded-lg px-2 text-sm text-[var(--muted)] transition hover:bg-[var(--hover)] hover:text-[var(--secondary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]"><svg aria-hidden viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /><path d="M9 12h11" /></svg><span>{label}</span></Link>;
}
