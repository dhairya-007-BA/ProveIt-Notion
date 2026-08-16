"use client";

import { ReactNode } from "react";
import { BackButton } from "@/components/back-button";

export function RecordDetailShell({ backHref, backLabel, actions, children }: { backHref: string; backLabel: string; actions?: ReactNode; children: ReactNode }) {
  return <main className="min-h-screen bg-[var(--background)]"><section className="proveit-content"><div className="mx-auto max-w-[54rem]"><header className="flex min-h-10 items-center justify-between border-b border-[var(--border)] pb-3"><BackButton href={backHref} label={backLabel} />{actions && <div className="flex items-center gap-2">{actions}</div>}</header>{children}</div></section></main>;
}

export function RecordTitle({ value, onChange, onBlur, placeholder = "Untitled", ariaLabel }: { value: string; onChange: (value: string) => void; onBlur?: (value: string) => void; placeholder?: string; ariaLabel: string }) {
  return <input aria-label={ariaLabel} value={value} onChange={(event) => onChange(event.target.value)} onBlur={(event) => onBlur?.(event.target.value)} placeholder={placeholder} className="proveit-heading mt-9 w-full rounded-lg px-2 py-1.5 text-4xl font-semibold tracking-[-0.045em] text-[var(--foreground)] outline-none placeholder:text-[var(--subtle)] transition hover:bg-[var(--hover)] focus:bg-[var(--input)] focus:ring-2 focus:ring-[var(--secondary)]/25 sm:text-5xl" />;
}

export function RecordProperties({ children }: { children: ReactNode }) {
  return <section className="mt-7 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 shadow-[var(--shadow-sm)]">{children}</section>;
}

export function RecordProperty({ label, icon = "◦", children }: { label: string; icon?: string; children: ReactNode }) {
  return <div className="group flex min-h-10 items-center gap-3 rounded-lg px-2 py-1.5 transition hover:bg-[var(--hover)]"><span aria-hidden className="w-4 shrink-0 text-center text-xs text-[var(--subtle)]">{icon}</span><span className="w-32 shrink-0 text-sm text-[var(--muted)] sm:w-40">{label}</span><div className="min-w-0 flex-1 text-sm text-[var(--foreground)]">{children}</div></div>;
}

export function RecordContentSection({ title, description, action, children }: { title: string; description?: string; action?: ReactNode; children: ReactNode }) {
  return <section className="mt-9 border-t border-[var(--border)] pt-6"><div className="flex items-start justify-between gap-4"><div><h2 className="text-base font-semibold tracking-[-0.015em] text-[var(--foreground)]">{title}</h2>{description && <p className="mt-1 text-sm leading-6 text-[var(--muted)]">{description}</p>}</div>{action}</div><div className="mt-4">{children}</div></section>;
}
