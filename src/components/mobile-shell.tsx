"use client";

import Link from "next/link";
import { signOut } from "firebase/auth";
import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { usePathname, useRouter } from "next/navigation";

import { NavigationIcon, workspaceModules } from "@/components/app-navigation";
import { NotificationBell } from "@/components/notification-bell";
import { ProveItLogo } from "@/components/proveit-logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { Avatar } from "@/components/ui/avatar";
import { IconButton } from "@/components/ui/icon-button";
import { useAuth } from "@/components/auth-provider";
import { getAccessibleWorkspaces } from "@/lib/accessible-workspaces";
import { auth } from "@/lib/firebase";
import type { Workspace } from "@/types/workspace";

function openSearch() {
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }));
}

function navClass(active: boolean) {
  return `flex min-h-11 items-center rounded-[var(--radius-md)] px-3 py-2.5 text-sm transition ${active ? "proveit-nav-active font-medium" : "text-[var(--text-muted)] hover:bg-[var(--hover)] hover:text-[var(--text)]"}`;
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

  useEffect(() => { if (profile) void getAccessibleWorkspaces(profile).then(setWorkspaces).catch(() => setWorkspaces([])); }, [profile]);
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (navigationOpen) setNavigationOpen(false); else setAccountOpen(false);
    };
    const outside = (event: MouseEvent) => { if (accountMenuRef.current && !accountMenuRef.current.contains(event.target as Node)) setAccountOpen(false); };
    window.addEventListener("keydown", escape);
    window.addEventListener("mousedown", outside);
    return () => { window.removeEventListener("keydown", escape); window.removeEventListener("mousedown", outside); };
  }, [navigationOpen]);
  useEffect(() => {
    if (!navigationOpen) return;
    const trigger = navigationTriggerRef.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const timer = window.setTimeout(() => closeNavigationRef.current?.focus(), 0);
    return () => { window.clearTimeout(timer); document.body.style.overflow = previousOverflow; trigger?.focus(); };
  }, [navigationOpen]);
  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 768px)");
    const closeAtDesktop = (event: MediaQueryListEvent) => { if (event.matches) setNavigationOpen(false); };
    desktop.addEventListener("change", closeAtDesktop);
    return () => desktop.removeEventListener("change", closeAtDesktop);
  }, []);

  if (!firebaseUser || pathname === "/login" || pathname === "/change-password") return null;

  const closeNavigation = () => setNavigationOpen(false);
  const handleNavigationKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.key !== "Tab" || !navigationRef.current) return;
    const focusable = Array.from(navigationRef.current.querySelectorAll<HTMLElement>("a[href], button:not([disabled])"));
    if (!focusable.length) return;
    const currentIndex = focusable.indexOf(document.activeElement as HTMLElement);
    const nextIndex = event.shiftKey ? (currentIndex <= 0 ? focusable.length - 1 : currentIndex - 1) : (currentIndex === focusable.length - 1 ? 0 : currentIndex + 1);
    event.preventDefault();
    focusable[nextIndex]?.focus();
  };
  const logout = async () => { await signOut(auth); router.replace("/login"); };

  return <>
    <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-[var(--border)] bg-[color-mix(in_srgb,var(--sidebar)_94%,transparent)] px-3 backdrop-blur-md md:hidden">
      <div className="flex items-center gap-1">
        <IconButton ref={navigationTriggerRef} label="Open navigation" aria-expanded={navigationOpen} aria-controls="mobile-navigation" onClick={() => { setAccountOpen(false); setNavigationOpen(true); }}><MenuIcon /></IconButton>
        <Link href="/" aria-label="ProveIt home" className="rounded-[var(--radius-md)] px-1 py-1.5"><ProveItLogo className="h-7 w-24" priority /></Link>
      </div>
      <div className="flex items-center gap-1">
        <IconButton label="Open search" onClick={openSearch}><NavigationIcon name="search" /></IconButton>
        <NotificationBell />
        <div ref={accountMenuRef} className="relative">
          <button type="button" aria-label="Open account options" aria-expanded={accountOpen} onClick={() => { setNavigationOpen(false); setAccountOpen((value) => !value); }} className="grid h-10 w-10 place-items-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]"><Avatar name={profile?.name} /></button>
          {accountOpen ? <section aria-label="Account options" className="absolute right-0 top-[calc(100%+0.5rem)] z-50 w-64 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-raised)] p-2 shadow-[var(--shadow-md)]"><div className="px-3 py-2"><p className="truncate text-sm font-medium">{profile?.name}</p><p className="mt-1 text-xs text-[var(--text-muted)]">Employee ID · {profile?.employeeId}</p></div><Link href="/profile" onClick={() => setAccountOpen(false)} className="block rounded-[var(--radius-md)] px-3 py-2 text-sm hover:bg-[var(--hover)]">Your profile</Link><div className="flex items-center justify-between rounded-[var(--radius-md)] px-3 py-2 text-sm"><span>Appearance</span><ThemeToggle /></div><div className="my-1 border-t border-[var(--border)]" /><button type="button" onClick={() => void logout()} className="w-full rounded-[var(--radius-md)] px-3 py-2 text-left text-sm font-medium text-[var(--danger)] hover:bg-[var(--danger-soft)]">Sign out</button></section> : null}
        </div>
      </div>
    </header>

    {navigationOpen ? <div className="fixed inset-0 z-[90] bg-black/40 md:hidden" onMouseDown={(event) => { if (event.target === event.currentTarget) closeNavigation(); }}>
      <section ref={navigationRef} id="mobile-navigation" role="dialog" aria-modal="true" aria-label="Navigation" onKeyDown={handleNavigationKeyDown} className="flex h-full w-[min(22rem,calc(100vw-2.5rem))] flex-col border-r border-[var(--border)] bg-[var(--surface-raised)] shadow-[var(--shadow-md)]">
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-[var(--border)] px-3">
          <Link href="/" onClick={closeNavigation} aria-label="ProveIt home"><ProveItLogo className="h-7 w-24" priority /></Link>
          <IconButton ref={closeNavigationRef} label="Close navigation" onClick={closeNavigation}><CloseIcon /></IconButton>
        </header>
        <nav className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-4" aria-label="Primary navigation">
          <button type="button" onClick={() => { closeNavigation(); window.setTimeout(openSearch, 0); }} className={`${navClass(false)} mb-2 w-full gap-3 border border-[var(--border)] bg-[var(--surface)] text-left shadow-[var(--shadow-sm)]`}><NavigationIcon name="search" className="h-4 w-4" /><span>Search</span></button>
          <Link href="/" aria-current={pathname === "/" ? "page" : undefined} onClick={closeNavigation} className={`${navClass(pathname === "/")} mb-5 gap-3`}><NavigationIcon name="home" className="h-4 w-4" />Home</Link>
          <p className="proveit-label mb-2 px-3">Workspaces</p>
          {workspaces.map((workspace) => {
            const href = `/workspaces/${workspace.id}`;
            const currentWorkspace = workspace.id === workspaceId;
            const isExpanded = expandedWorkspaces[workspace.id] ?? currentWorkspace;
            return <section key={workspace.id} className="mb-1">
              <div className="flex items-center rounded-[var(--radius-md)]">
                <IconButton label={`${isExpanded ? "Collapse" : "Expand"} ${workspace.name}`} aria-expanded={isExpanded} aria-controls={`mobile-workspace-${workspace.id}`} onClick={() => setExpandedWorkspaces((current) => ({ ...current, [workspace.id]: !isExpanded }))} className="h-9 min-h-9 w-8"><NavigationIcon name="chevron" className={`h-3.5 w-3.5 transition-transform ${isExpanded ? "rotate-90" : ""}`} /></IconButton>
                <Link href={href} aria-current={pathname === href ? "page" : undefined} onClick={closeNavigation} className={`flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-[var(--radius-md)] px-2 text-sm ${currentWorkspace ? "font-medium text-[var(--text)]" : "text-[var(--text-muted)]"}`}><span className="grid h-7 w-7 place-items-center rounded-md bg-[var(--info-soft)] text-xs font-semibold text-[var(--info)]">{workspace.name.slice(0, 1).toUpperCase()}</span><span className="truncate">{workspace.name}</span></Link>
              </div>
              {isExpanded ? <div id={`mobile-workspace-${workspace.id}`} className="ml-5 border-l border-[var(--border)] pl-3">{workspaceModules.map((module) => {
                const moduleHref = `${href}/${module.id}`;
                const active = pathname.startsWith(moduleHref);
                return <Link key={module.id} href={moduleHref} aria-current={active ? "page" : undefined} onClick={closeNavigation} className={`${navClass(active)} gap-2`}><NavigationIcon name={module.icon} className="h-4 w-4" />{module.label}</Link>;
              })}</div> : null}
            </section>;
          })}
          {canManageWorkspaces ? <section className="mt-6 border-t border-[var(--border)] pt-4"><p className="proveit-label mb-2 px-3">Administration</p>{profile?.group === "bod" ? <Link href="/admin/employees" onClick={closeNavigation} className={`${navClass(pathname.startsWith("/admin/employees"))} gap-3`}><NavigationIcon name="people" className="h-4 w-4" />Employees</Link> : null}<Link href="/admin/workspaces" onClick={closeNavigation} className={`${navClass(pathname.startsWith("/admin/workspaces"))} gap-3`}><NavigationIcon name="settings" className="h-4 w-4" />Workspace settings</Link><Link href="/admin/notion-migration" onClick={closeNavigation} className={`${navClass(pathname.startsWith("/admin/notion-migration"))} gap-3`}><NavigationIcon name="upload" className="h-4 w-4" />Notion migration</Link></section> : null}
        </nav>
      </section>
    </div> : null}
  </>;
}

function MenuIcon() { return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 7h16M4 12h16M4 17h16" /></svg>; }
function CloseIcon() { return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="m6 6 12 12M18 6 6 18" /></svg>; }
