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