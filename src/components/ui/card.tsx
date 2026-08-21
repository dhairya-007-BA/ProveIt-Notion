import type { HTMLAttributes } from "react";

import { cn } from "@/components/ui/utils";

export type CardTone = "base" | "raised" | "subtle";

export function Card({ className, tone = "base", ...props }: HTMLAttributes<HTMLElement> & { tone?: CardTone }) {
  return <section className={cn("rounded-[var(--radius-lg)] border border-[var(--border)]", tone === "raised" && "bg-[var(--surface-raised)] shadow-[var(--shadow-sm)]", tone === "subtle" && "bg-[var(--surface-subtle)]", tone === "base" && "bg-[var(--surface)]", className)} {...props} />;
}

export function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex items-start justify-between gap-4", className)} {...props} />;
}
