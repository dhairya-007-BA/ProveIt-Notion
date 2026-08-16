"use client";
import Link from "next/link";
import { signOut } from "firebase/auth";
import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ProveItLogo } from "@/components/proveit-logo";
import { NotificationBell } from "@/components/notification-bell";
import { ThemeToggle } from "@/components/theme-toggle";
import { useAuth } from "@/components/auth-provider";
import { auth } from "@/lib/firebase";

function initials(name = "") { return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "P"; }
export function MobileShell() {
  const { firebaseUser, profile } = useAuth(); const pathname = usePathname(); const router = useRouter(); const ref = useRef<HTMLDivElement>(null); const [open, setOpen] = useState(false);
  useEffect(() => { const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); }; const outside = (event: MouseEvent) => { if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false); }; window.addEventListener("keydown", escape); window.addEventListener("mousedown", outside); return () => { window.removeEventListener("keydown", escape); window.removeEventListener("mousedown", outside); }; }, []);
  if (!firebaseUser || pathname === "/login") return null;
  async function logout() { await signOut(auth); router.replace("/login"); }
  return <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-[var(--border)] bg-[var(--sidebar)] px-3 md:hidden"><Link href="/" aria-label="ProveIt home"><ProveItLogo className="h-7 w-24" priority /></Link><div className="flex items-center gap-1"><button type="button" aria-label="Open search" onClick={() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }))} className="grid h-10 w-10 place-items-center rounded-lg text-[var(--muted)] hover:bg-[var(--hover)]">⌕</button><NotificationBell /><div ref={ref} className="relative"><button type="button" aria-label="Open account menu" aria-expanded={open} onClick={() => setOpen((value) => !value)} className="grid h-10 w-10 place-items-center rounded-full bg-[var(--selected)] text-xs font-semibold text-[var(--secondary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]">{initials(profile?.name)}</button>{open && <section role="menu" aria-label="Account menu" className="absolute right-0 top-[calc(100%+0.5rem)] w-64 rounded-xl border border-[var(--border)] bg-[var(--surface-elevated)] p-2 shadow-[var(--shadow-md)]"><p className="px-3 py-2 text-sm font-medium">{profile?.name}</p><Link role="menuitem" href="/profile" onClick={() => setOpen(false)} className="block rounded-lg px-3 py-2 text-sm hover:bg-[var(--hover)]">Your profile</Link><div className="flex items-center justify-between px-3 py-2 text-sm"><span>Appearance</span><ThemeToggle /></div><div className="my-1 border-t border-[var(--border)]" /><button role="menuitem" type="button" onClick={() => void logout()} className="w-full rounded-lg px-3 py-2 text-left text-sm text-[var(--danger)] hover:bg-[var(--status-danger-bg)]">Sign out</button></section>}</div></div></header>;
}
