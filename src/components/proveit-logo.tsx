import Image from "next/image";

import proveItLogo from "../../logo.png";

type ProveItLogoProps = {
  className?: string;
  priority?: boolean;
};

export function ProveItLogo({
  className = "h-8 w-8",
  priority = false,
}: ProveItLogoProps) {
  return (
    <Image
      alt="ProveIt"
      className={`rounded-lg object-contain ${className}`}
      priority={priority}
      src={proveItLogo}
    />
  );
}
