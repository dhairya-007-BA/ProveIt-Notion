import Image from "next/image";

type ProveItLogoProps = {
  className?: string;
  priority?: boolean;
};

export function ProveItLogo({
  className = "h-auto w-32",
  priority = false,
}: ProveItLogoProps) {
  return (
    <span className="proveit-logo">
      <Image
        alt="ProveIt"
        className={`proveit-logo-light object-contain ${className}`}
        height={200}
        priority={priority}
        src="/proveit-logo-light.png"
        width={600}
      />
      <Image
        alt=""
        aria-hidden="true"
        className={`proveit-logo-dark object-contain ${className}`}
        height={200}
        priority={priority}
        src="/proveit-logo-dark.png"
        width={600}
      />
    </span>
  );
}

/** Compact mark derived from the magnifier/check in the canonical wordmark. */
export function ProveItMark({ className = "h-8 w-8" }: { className?: string }) {
  return <svg aria-hidden="true" viewBox="0 0 40 40" className={className} fill="none"><circle cx="17" cy="17" r="11.5" stroke="var(--brand-primary)" strokeWidth="5" /><path d="m25.5 25.5 9 9" stroke="var(--brand-primary)" strokeWidth="5" strokeLinecap="round" /><path d="m11.5 17 4 4 7-8" stroke="var(--brand-secondary)" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}
