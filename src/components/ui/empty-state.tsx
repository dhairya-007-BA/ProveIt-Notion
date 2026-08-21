import type { ReactNode } from "react";

import { cn } from "@/components/ui/utils";

export function EmptyState({ action, className, description, icon, title }: { action?: ReactNode; className?: string; description?: string; icon?: ReactNode; title: string }) {
  return <div className={cn("grid min-h-32 place-items-center rounded-[var(--radius-lg)] border border-dashed border-[var(--border-strong)] bg-[var(--surface-subtle)] px-5 py-8 text-center", className)}>
    <div className="max-w-sm">
      {icon ? <div className="mx-auto mb-3 grid h-10 w-10 place-items-center rounded-full bg-[var(--info-soft)] text-[var(--info)]">{icon}</div> : null}
      <p className="text-sm font-semibold text-[var(--text)]">{title}</p>
      {description ? <p className="mt-1 text-sm leading-6 text-[var(--text-muted)]">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  </div>;
}
