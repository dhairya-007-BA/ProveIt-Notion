"use client";

import Link from "next/link";
import { ReactNode } from "react";

export function RecordDetailShell({ backHref, backLabel, actions, children }: { backHref: string; backLabel: string; actions?: ReactNode; children: ReactNode }) {
  return <main className="min-h-screen bg-[#fbfbfa]"><section className="min-w-0 px-5 py-6 sm:px-8 md:px-12"><div className="mx-auto max-w-3xl"><header className="flex min-h-9 items-center justify-between border-b border-black/[0.08] pb-3"><Link href={backHref} className="rounded px-1.5 py-1 text-sm text-[#787774] transition hover:bg-black/[0.045] hover:text-[#37352f] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2383e2]/50">← {backLabel}</Link>{actions && <div className="flex items-center gap-2">{actions}</div>}</header>{children}</div></section></main>;
}

export function RecordTitle({ value, onChange, onBlur, placeholder = "Untitled", ariaLabel }: { value: string; onChange: (value: string) => void; onBlur?: (value: string) => void; placeholder?: string; ariaLabel: string }) {
  return <input aria-label={ariaLabel} value={value} onChange={(event) => onChange(event.target.value)} onBlur={(event) => onBlur?.(event.target.value)} placeholder={placeholder} className="mt-9 w-full rounded bg-transparent px-1 py-1 text-4xl font-semibold tracking-[-0.035em] text-[#37352f] outline-none placeholder:text-[#b4b3af] hover:bg-black/[0.025] focus:bg-black/[0.03] focus-visible:ring-2 focus-visible:ring-[#2383e2]/35 sm:text-5xl" />;
}

export function RecordProperties({ children }: { children: ReactNode }) {
  return <section className="mt-7 border-y border-black/[0.08] py-2">{children}</section>;
}

export function RecordProperty({ label, icon = "◦", children }: { label: string; icon?: string; children: ReactNode }) {
  return <div className="group flex min-h-10 items-center gap-3 rounded px-1 py-1 transition hover:bg-black/[0.028]"><span aria-hidden className="w-4 shrink-0 text-center text-xs text-[#9b9a97]">{icon}</span><span className="w-32 shrink-0 text-sm text-[#787774] sm:w-40">{label}</span><div className="min-w-0 flex-1 text-sm text-[#37352f]">{children}</div></div>;
}

export function RecordContentSection({ title, description, action, children }: { title: string; description?: string; action?: ReactNode; children: ReactNode }) {
  return <section className="mt-8 border-t border-black/[0.08] pt-5"><div className="flex items-start justify-between gap-4"><div><h2 className="text-base font-medium text-[#37352f]">{title}</h2>{description && <p className="mt-1 text-sm leading-6 text-[#787774]">{description}</p>}</div>{action}</div><div className="mt-3">{children}</div></section>;
}
