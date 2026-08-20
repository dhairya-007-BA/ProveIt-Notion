"use client";

import Link from "next/link";
import { signOut } from "firebase/auth";
import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { usePathname, useRouter } from "next/navigation";

import { ProveItLogo } from "@/components/proveit-logo";
import { NotificationBell } from "@/components/notification-bell";
import { ThemeToggle } from "@/components/theme-toggle";
import { useAuth } from "@/components/auth-provider";
import { getAccessibleWorkspaces } from "@/lib/accessible-workspaces";
import { auth } from "@/lib/firebase";
import type { Workspace } from "@/types/workspace";

const modules = ["dashboard", "inbox", "documents", "tasks", "meetings", "databases", "activity"] as const;
const labels: Record<(typeof modules)[number], string> = {
  dashboard: "Dashboard",
  inbox: "Inbox",
  documents: "Documents",
  tasks: "Tasks",
  meetings: "Meetings",
  databases: "Databases",
  activity: "Recent activity",
};

function initials(name = "") {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "P";
}

function openSearch() {
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }));
}

export function MobileShell() {
  const { firebaseUser, profile } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const accountMenuRef = useRef<HTMLDivElement>(null);
  const navigationRef = useRef<HTMLElement>(null);
  const navigationTriggerRef = useRef<HTMLButtonElement>(null);
  const closeNavigationRef = useRef<HTMLButtonElement>(null);
  const [accountOpen, setAccountOpen] = useState(false);
  const [navigationOpen, setNavigationOpen] = useState(false);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [expandedWorkspaces, setExpandedWorkspaces] = useState<Record<string, boolean>>({});
  const workspaceId = pathname.match(/^\/workspaces\/([^/]+)/)?.[1];
  const canManageWorkspaces = profile?.group === "bod" || profile?.capabilities?.manageWorkspaces === true;

  useEffect(() => {
    if (profile) {
      void getAccessibleWorkspaces(profile).then(setWorkspaces).catch(() => setWorkspaces([]));
    }
  }, [profile]);

  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (navigationOpen) {
        setNavigationOpen(false);
        return;
      }
      setAccountOpen(false);
    };
    const outside = (event: MouseEvent) => {
      if (accountMenuRef.current && !accountMenuRef.current.contains(event.target as Node)) setAccountOpen(false);
    };
    window.addEventListener("keydown", escape);
    window.addEventListener("mousedown", outside);
    return () => {
      window.removeEventListener("keydown", escape);
      window.removeEventListener("mousedown", outside);
    };
  }, [navigationOpen]);

  useEffect(() => {
    if (!navigationOpen) return;
    const navigationTrigger = navigationTriggerRef.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const timer = window.setTimeout(() => closeNavigationRef.current?.focus(), 0);
    return () => {
      window.clearTimeout(timer);
      document.body.style.overflow = previousOverflow;
      navigationTrigger?.focus();
    };
  }, [navigationOpen]);

  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 768px)");
    const closeAtDesktop = (event: MediaQueryListEvent) => { if (event.matches) setNavigationOpen(false); };
    desktop.addEventListener("change", closeAtDesktop);
    return () => desktop.removeEventListener("change", closeAtDesktop);
  }, []);

  if (!firebaseUser || pathname === "/login") return null;

  const nav = (active: boolean) => `flex min-h-11 items-center rounded-lg px-3 py-2.5 text-sm transition ${active ? "proveit-nav-active font-medium" : "text-[var(--muted)] hover:bg-[var(--hover)] hover:text-[var(--foreground)]"}`;
  const closeNavigation = () => setNavigationOpen(false);
  const handleNavigationKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.key !== "Tab" || !navigationRef.current) return;
    const focusable = Array.from(navigationRef.current.querySelectorAll<HTMLElement>("a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])"));
    if (!focusable.length) return;
    const currentIndex = focusable.indexOf(document.activeElement as HTMLElement);
    const nextIndex = event.shiftKey
      ? (currentIndex <= 0 ? focusable.length - 1 : currentIndex - 1)
      : (currentIndex === focusable.length - 1 ? 0 : currentIndex + 1);
    event.preventDefault();
    focusable[nextIndex]?.focus();
  };
  const logout = async () => {
    await signOut(auth);
    router.replace("/login");
  };

  return <>
    <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-[var(--border)] bg-[var(--sidebar)] px-3 md:hidden">
      <div className="flex items-center gap-1">
        <button ref={navigationTriggerRef} type="button" aria-label="Open navigation" aria-expanded={navigationOpen} aria-controls="mobile-navigation" onClick={() => { setAccountOpen(false); setNavigationOpen(true); }} className="grid h-10 w-10 place-items-center rounded-lg text-lg text-[var(--muted)] hover:bg-[var(--hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]">☰</button>
        <Link href="/" aria-label="ProveIt home" className="rounded-lg px-1 py-1.5"><ProveItLogo className="h-7 w-24" priority /></Link>
      </div>
      <div className="flex items-center gap-1">
        <button type="button" aria-label="Open search" onClick={openSearch} className="grid h-10 w-10 place-items-center rounded-lg text-[var(--muted)] hover:bg-[var(--hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]">⌕</button>
        <NotificationBell />
        <div ref={accountMenuRef} className="relative">
          <button type="button" aria-label="Open account menu" aria-expanded={accountOpen} onClick={() => { setNavigationOpen(false); setAccountOpen((value) => !value); }} className="grid h-10 w-10 place-items-center rounded-full bg-[var(--selected)] text-xs font-semibold text-[var(--secondary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]">{initials(profile?.name)}</button>
          {accountOpen && <section role="menu" aria-label="Account menu" className="absolute right-0 top-[calc(100%+0.5rem)] z-50 w-64 rounded-xl border border-[var(--border)] bg-[var(--surface-elevated)] p-2 shadow-[var(--shadow-md)]"><p className="px-3 py-2 text-sm font-medium">{profile?.name}</p><Link role="menuitem" href="/profile" onClick={() => setAccountOpen(false)} className="block rounded-lg px-3 py-2 text-sm hover:bg-[var(--hover)]">Your profile</Link><div className="flex items-center justify-between px-3 py-2 text-sm"><span>Appearance</span><ThemeToggle /></div><div className="my-1 border-t border-[var(--border)]" /><button role="menuitem" type="button" onClick={() => void logout()} className="w-full rounded-lg px-3 py-2 text-left text-sm text-[var(--danger)] hover:bg-[var(--status-danger-bg)]">Sign out</button></section>}
        </div>
      </div>
    </header>
    {navigationOpen && <div className="fixed inset-0 z-[90] bg-black/35 md:hidden" onMouseDown={(event) => { if (event.target === event.currentTarget) closeNavigation(); }}>
      <section ref={navigationRef} id="mobile-navigation" role="dialog" aria-modal="true" aria-label="Navigation" onKeyDown={handleNavigationKeyDown} className="flex h-full w-[min(22rem,calc(100vw-2.5rem))] flex-col border-r border-[var(--border)] bg-[var(--surface-elevated)] shadow-[var(--shadow-md)]">
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-[var(--border)] px-3">
          <Link href="/" onClick={closeNavigation} aria-label="ProveIt home"><ProveItLogo className="h-7 w-24" priority /></Link>
          <button ref={closeNavigationRef} type="button" onClick={closeNavigation} className="grid h-10 w-10 place-items-center rounded-lg text-lg text-[var(--muted)] hover:bg-[var(--hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]" aria-label="Close navigation">×</button>
        </header>
        <nav className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-4" aria-label="Primary navigation">
          <button type="button" onClick={() => { closeNavigation(); window.setTimeout(openSearch, 0); }} className={`${nav(false)} mb-2 w-full gap-3 border border-[var(--border)] bg-[var(--surface)] text-left`}><span aria-hidden className="text-base">⌕</span><span>Search</span></button>
          <Link href="/" onClick={closeNavigation} className={`${nav(pathname === "/")} mb-5 gap-3`}><span aria-hidden>⌂</span>Home</Link>
          <p className="proveit-label mb-2 px-3">Workspaces</p>
          {workspaces.map((workspace) => {
            const href = `/workspaces/${workspace.id}`;
            const expanded = expandedWorkspaces[workspace.id] ?? workspace.id === workspaceId;
            return <section key={workspace.id} className="mb-1">
              <div className={nav(workspace.id === workspaceId && pathname === href)}>
                <button type="button" aria-label={`${expanded ? "Collapse" : "Expand"} ${workspace.name}`} aria-expanded={expanded} aria-controls={`mobile-workspace-${workspace.id}`} onClick={() => setExpandedWorkspaces((current) => ({ ...current, [workspace.id]: !expanded }))} className="-ml-1 mr-1 grid h-8 w-8 place-items-center rounded-md text-[var(--muted)] hover:bg-[var(--hover)]">{expanded ? "⌄" : "›"}</button>
                <Link href={href} onClick={closeNavigation} className="flex min-w-0 flex-1 items-center gap-2"><span aria-hidden className="grid h-6 w-6 place-items-center rounded-md bg-[var(--selected)] text-xs font-semibold text-[var(--secondary)]">{workspace.name.slice(0, 1)}</span><span className="truncate">{workspace.name}</span></Link>
              </div>
              {expanded && <div id={`mobile-workspace-${workspace.id}`} className="ml-5 border-l border-[var(--border)] pl-3">{modules.map((module) => <Link key={module} href={`${href}/${module}`} onClick={closeNavigation} className={`${nav(pathname.startsWith(`${href}/${module}`))} min-h-10 px-3 py-2 text-[13px]`}>{labels[module]}</Link>)}</div>}
            </section>;
          })}
          {canManageWorkspaces && <section className="mt-6 border-t border-[var(--border)] pt-4"><p className="proveit-label mb-2 px-3">Administration</p>{profile?.group === "bod" && <Link href="/admin/employees" onClick={closeNavigation} className={`${nav(pathname.startsWith("/admin/employees"))} gap-3`}><span aria-hidden>⚙</span>Employees</Link>}<Link href="/admin/workspaces" onClick={closeNavigation} className={`${nav(pathname.startsWith("/admin/workspaces"))} gap-3`}><span aria-hidden>⚙</span>Workspace settings</Link><Link href="/admin/notion-migration" onClick={closeNavigation} className={`${nav(pathname.startsWith("/admin/notion-migration"))} gap-3`}><span aria-hidden>↗</span>Notion migration</Link></section>}
        </nav>
      </section>
    </div>}
  </>;
}
