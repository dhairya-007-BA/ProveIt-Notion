"use client";

import { useId, type ReactNode } from "react";

import { IconButton } from "@/components/ui/icon-button";
import { useModalBehavior } from "@/components/ui/use-modal-behavior";
import { cn } from "@/components/ui/utils";

export function SideSheet({ children, className, closeLabel = "Close panel", description, footer, onClose, open, title }: { children: ReactNode; className?: string; closeLabel?: string; description?: string; footer?: ReactNode; onClose: () => void; open: boolean; title: string }) {
  const titleId = useId();
  const descriptionId = useId();
  const { containerRef, initialFocusRef, onKeyDown } = useModalBehavior(open, onClose);
  if (!open) return null;

  return <div className="fixed inset-0 z-[100] bg-black/40" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <aside ref={containerRef} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={description ? descriptionId : undefined} onKeyDown={onKeyDown} className={cn("absolute inset-0 flex min-h-0 flex-col bg-[var(--surface-raised)] shadow-[var(--shadow-md)] sm:inset-y-0 sm:left-auto sm:right-0 sm:w-[min(42rem,calc(100vw-3rem))] sm:border-l sm:border-[var(--border)]", className)}>
      <header className="flex shrink-0 items-start justify-between gap-4 border-b border-[var(--border)] px-4 py-3 sm:px-5 sm:py-4">
        <div><h2 id={titleId} className="proveit-heading text-base font-semibold text-[var(--text)]">{title}</h2>{description ? <p id={descriptionId} className="mt-1 text-sm leading-6 text-[var(--text-muted)]">{description}</p> : null}</div>
        <IconButton ref={initialFocusRef} label={closeLabel} onClick={onClose}><CloseIcon /></IconButton>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-5">{children}</div>
      {footer ? <footer className="flex shrink-0 flex-col-reverse gap-2 border-t border-[var(--border)] px-4 py-3 sm:flex-row sm:justify-end sm:px-5 sm:py-4">{footer}</footer> : null}
    </aside>
  </div>;
}

function CloseIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="m6 6 12 12M18 6 6 18" /></svg>;
}
