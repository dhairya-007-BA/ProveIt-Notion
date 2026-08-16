import Image from "next/image";

import darkLogo from "../../Logo-DarkMode.png";
import lightLogo from "../../Logo-LightMode.png";

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
        priority={priority}
        src={lightLogo}
      />
      <Image
        alt=""
        aria-hidden="true"
        className={`proveit-logo-dark object-contain ${className}`}
        priority={priority}
        src={darkLogo}
      />
    </span>
  );
}
