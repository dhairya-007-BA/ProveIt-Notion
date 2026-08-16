"use client";

import { useEffect, useRef } from "react";

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  loading?: boolean;
  error?: string;
  onCancel: () => void;
  onConfirm: () => void;
};

export function ConfirmDialog({ open, title, description, confirmLabel, loading = false, error, onCancel, onConfirm }: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const timer = window.setTimeout(() => cancelRef.current?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, [open]);
  useEffect(() => { if (!open) returnFocus.current?.focus(); }, [open]);
  if (!open) return null;

  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape" && !loading) { event.preventDefault(); onCancel(); return; }
    if (event.key !== "Tab" || !dialogRef.current) return;
    const controls = Array.from(dialogRef.current.querySelectorAll<HTMLButtonElement>("button:not([disabled])"));
    const index = controls.indexOf(document.activeElement as HTMLButtonElement);
    event.preventDefault();
    controls[event.shiftKey ? (index <= 0 ? controls.length - 1 : index - 1) : (index >= controls.length - 1 ? 0 : index + 1)]?.focus();
  }

  return <div className="fixed inset-0 z-[100] grid place-items-center bg-black/35 p-4 backdrop-blur-[1px]" onMouseDown={(event) => { if (event.target === event.currentTarget && !loading) onCancel(); }}>
    <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="confirm-dialog-title" aria-describedby="confirm-dialog-description" onKeyDown={onKeyDown} className="w-full max-w-md rounded-xl border border-[var(--border)] bg-[var(--surface-elevated)] p-5 shadow-[var(--shadow-md)] sm:p-6">
      <h2 id="confirm-dialog-title" className="proveit-section-title">{title}</h2>
      <p id="confirm-dialog-description" className="mt-2 text-sm leading-6 text-[var(--muted)]">{description}</p>
      {error ? <p role="alert" className="mt-4 text-sm text-[var(--danger)]">{error}</p> : null}
      <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button ref={cancelRef} type="button" disabled={loading} onClick={onCancel} className="proveit-secondary-button disabled:opacity-50">Cancel</button>
        <button type="button" disabled={loading} onClick={onConfirm} className="rounded-lg bg-[var(--danger)] px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)] disabled:cursor-not-allowed disabled:opacity-50">{loading ? "Working…" : confirmLabel}</button>
      </div>
    </div>
  </div>;
}
