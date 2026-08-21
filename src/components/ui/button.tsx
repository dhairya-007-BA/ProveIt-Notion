import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";

import { cn } from "@/components/ui/utils";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  loadingLabel?: string;
  leadingIcon?: ReactNode;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, children, disabled, leadingIcon, loading = false, loadingLabel = "Working…", size = "md", variant = "primary", ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      className={cn("proveit-button", `proveit-button-${variant}`, size !== "md" && `proveit-button-${size}`, className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <Spinner /> : leadingIcon}
      <span>{loading ? loadingLabel : children}</span>
    </button>
  );
});

function Spinner() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 animate-spin fill-none stroke-current" strokeWidth="2"><circle cx="12" cy="12" r="9" opacity=".25" /><path d="M21 12a9 9 0 0 0-9-9" strokeLinecap="round" /></svg>;
}
