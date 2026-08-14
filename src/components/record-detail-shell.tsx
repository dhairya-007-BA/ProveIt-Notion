"use client";

import Link from "next/link";
import { ReactNode } from "react";

export function RecordDetailShell({ backHref, backLabel, children }: { backHref: string; backLabel: string; children: ReactNode }) {
  return <main className="min-h-screen bg-[#fbfbfa]"><section className="min-w-0 px-6 py-7 md:px-10"><div className="mx-auto max-w-3xl"><header className="flex items-center justify-between border-b border-black/[0.08] pb-3"><Link href={backHref} className="rounded px-1 py-1 text-sm text-[#787774] hover:bg-black/[0.04] hover:text-[#37352f]">← {backLabel}</Link></header>{children}</div></section></main>;
}

export function RecordProperties({ children }: { children: ReactNode }) {
  return <section className="mt-7 border-y border-black/[0.08] py-2">{children}</section>;
}

export function RecordProperty({ label, children }: { label: string; children: ReactNode }) {
  return <div className="flex min-h-9 items-center gap-3 py-1"><span className="w-40 shrink-0 text-sm text-[#787774]">{label}</span><div className="min-w-0 flex-1 text-sm text-[#37352f]">{children}</div></div>;
}
