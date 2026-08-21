"use client";

import { useId, type ReactNode } from "react";

import { IconButton } from "@/components/ui/icon-button";
import { useModalBehavior } from "@/components/ui/use-modal-behavior";
import { cn } from "@/components/ui/utils";

export function Dialog({ children, className, description, dismissOnBackdrop = true, footer, onClose, open, title }: { children: ReactNode; className?: string; description?: string; dismissOnBackdrop?: boolean; footer?: ReactNode; onClose: () => void; open: boolean; title: string }) {
  const titleId = useId();
  const descriptionId = useId();
  const { containerRef, initialFocusRef, onKeyDown } = useModalBehavior(open, onClose);
  if (!open) return null;

  return <div className="fixed inset-0 z-[100] grid place-items-center bg-black/40 p-3 sm:p-5" onMouseDown={(event) => { if (dismissOnBackdrop && event.target === event.currentTarget) onClose(); }}>
    <div ref={containerRef} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={description ? descriptionId : undefined} onKeyDown={onKeyDown} className={cn("flex max-h-[min(90dvh,48rem)] w-full max-w-lg flex-col overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-raised)] shadow-[var(--shadow-md)]", className)}>
      <header className="flex shrink-0 items-start justify-between gap-4 border-b border-[var(--border)] px-5 py-4">
        <div><h2 id={titleId} className="proveit-heading text-base font-semibold text-[var(--text)]">{title}</h2>{description ? <p id={descriptionId} className="mt-1 text-sm leading-6 text-[var(--text-muted)]">{description}</p> : null}</div>
        <IconButton ref={initialFocusRef} label="Close dialog" onClick={onClose}><CloseIcon /></IconButton>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">{children}</div>
      {footer ? <footer className="flex shrink-0 flex-col-reverse gap-2 border-t border-[var(--border)] px-5 py-4 sm:flex-row sm:justify-end">{footer}</footer> : null}
    </div>
  </div>;
}

function CloseIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="m6 6 12 12M18 6 6 18" /></svg>;
}
