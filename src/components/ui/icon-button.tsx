import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";

import { cn } from "@/components/ui/utils";
import type { ButtonVariant } from "@/components/ui/button";

type IconButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-label" | "children"> & {
  label: string;
  children: ReactNode;
  variant?: ButtonVariant;
};

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { children, className, label, title = label, variant = "ghost", ...props },
  ref,
) {
  return <button ref={ref} type="button" aria-label={label} title={title} className={cn("proveit-button proveit-icon-button", `proveit-button-${variant}`, className)} {...props}>{children}</button>;
});
