"use client";

import Link from "next/link";
import { signOut } from "firebase/auth";
import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

import { NavigationIcon, workspaceModules } from "@/components/app-navigation";
import { ProveItLogo, ProveItMark } from "@/components/proveit-logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { Avatar } from "@/components/ui/avatar";
import { IconButton } from "@/components/ui/icon-button";
import { useAuth } from "@/components/auth-provider";
import { getAccessibleWorkspaces } from "@/lib/accessible-workspaces";
import { auth } from "@/lib/firebase";
import type { Workspace } from "@/types/workspace";

function navClass(active: boolean) {
  return `flex min-h-9 items-center rounded-[var(--radius-md)] px-2.5 py-2 text-sm transition ${active ? "proveit-nav-active font-medium" : "text-[var(--text-muted)] hover:bg-[var(--hover)] hover:text-[var(--text)]"}`;
}

export default function Sidebar() {
  const { profile } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const accountRef = useRef<HTMLDivElement>(null);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [accountOpen, setAccountOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => typeof window !== "undefined" && localStorage.getItem("proveit-sidebar-collapsed") === "true");
  const workspaceId = pathname.match(/^\/workspaces\/([^/]+)/)?.[1];
  const canManageWorkspaces = profile?.group === "bod" || profile?.capabilities?.manageWorkspaces === true;

  useEffect(() => { localStorage.setItem("proveit-sidebar-collapsed", String(collapsed)); }, [collapsed]);
  useEffect(() => { if (profile) void getAccessibleWorkspaces(profile).then(setWorkspaces).catch(() => setWorkspaces([])); }, [profile]);
  useEffect(() => {
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setAccountOpen(false); };
    const outside = (event: MouseEvent) => { if (accountRef.current && !accountRef.current.contains(event.target as Node)) setAccountOpen(false); };
    window.addEventListener("keydown", escape);
    window.addEventListener("mousedown", outside);
    return () => { window.removeEventListener("keydown", escape); window.removeEventListener("mousedown", outside); };
  }, []);

  const logout = async () => { await signOut(auth); router.replace("/login"); };

  return <aside className={`sticky top-0 hidden h-screen shrink-0 flex-col border-r border-[var(--border)] bg-[var(--sidebar)] py-4 transition-[width] duration-200 md:flex ${collapsed ? "w-[72px] px-2" : "w-64 px-3"}`}>
    <div className="mb-4 flex items-center justify-between gap-2">
      <Link href="/" aria-label="ProveIt home" title={collapsed ? "ProveIt" : undefined} className="min-w-0 rounded-[var(--radius-md)] p-2 hover:bg-[var(--hover)]">{collapsed ? <ProveItMark className="h-7 w-7" /> : <ProveItLogo className="h-auto w-28" priority />}</Link>
      {!collapsed ? <IconButton label="Collapse sidebar" onClick={() => setCollapsed(true)} className="h-8 min-h-8 w-8"><NavigationIcon name="chevron" className="rotate-180" /></IconButton> : null}
    </div>
    {collapsed ? <IconButton label="Expand sidebar" onClick={() => setCollapsed(false)} className="mx-auto mb-3 h-9 min-h-9 w-9"><NavigationIcon name="chevron" /></IconButton> : null}

    <nav aria-label="Primary navigation" className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
      <button type="button" aria-label="Open search" title={collapsed ? "Search" : undefined} onClick={() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }))} className={`${navClass(false)} mb-2 w-full gap-2 border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-sm)]`}><NavigationIcon name="search" className="h-4 w-4 shrink-0" />{!collapsed ? <><span>Search</span><kbd className="ml-auto rounded border border-[var(--border)] px-1.5 py-0.5 text-[10px] text-[var(--text-subtle)]">⌘K</kbd></> : null}</button>
      <Link href="/" aria-current={pathname === "/" ? "page" : undefined} title={collapsed ? "Home" : undefined} className={`${navClass(pathname === "/")} mb-5 gap-2`}><NavigationIcon name="home" className="h-4 w-4 shrink-0" />{!collapsed ? <span>Home</span> : null}</Link>

      {!collapsed ? <p className="proveit-label mb-2 px-2">Workspaces</p> : <div className="mb-2 border-t border-[var(--border)]" />}
      {workspaces.map((workspace) => {
        const href = `/workspaces/${workspace.id}`;
        const currentWorkspace = workspace.id === workspaceId;
        const isExpanded = expanded[workspace.id] ?? currentWorkspace;
        return <div key={workspace.id} className="mb-1">
          <div className={collapsed ? "" : `flex items-center rounded-[var(--radius-md)] ${currentWorkspace ? "text-[var(--text)]" : "text-[var(--text-muted)]"}`}>
            {!collapsed ? <IconButton label={`${isExpanded ? "Collapse" : "Expand"} ${workspace.name}`} aria-expanded={isExpanded} aria-controls={`workspace-nav-${workspace.id}`} onClick={() => setExpanded((value) => ({ ...value, [workspace.id]: !isExpanded }))} className="h-8 min-h-8 w-7 shrink-0"><NavigationIcon name="chevron" className={`h-3.5 w-3.5 transition-transform ${isExpanded ? "rotate-90" : ""}`} /></IconButton> : null}
            <Link href={href} aria-current={pathname === href ? "page" : undefined} title={collapsed ? workspace.name : undefined} className={`${collapsed ? navClass(currentWorkspace) : "flex min-h-9 min-w-0 flex-1 items-center gap-2 rounded-[var(--radius-md)] px-1.5 py-2 text-sm hover:bg-[var(--hover)]"} gap-2`}><span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-[var(--info-soft)] text-[10px] font-semibold text-[var(--info)]">{workspace.name.slice(0, 1).toUpperCase()}</span>{!collapsed ? <span className="truncate font-medium">{workspace.name}</span> : null}</Link>
          </div>
          {!collapsed && isExpanded ? <div id={`workspace-nav-${workspace.id}`} className="ml-3 border-l border-[var(--border)] pl-3">{workspaceModules.map((module) => {
            const moduleHref = `${href}/${module.id}`;
            const active = pathname.startsWith(moduleHref);
            return <Link key={module.id} href={moduleHref} aria-current={active ? "page" : undefined} className={`${navClass(active)} gap-2 px-2 py-1.5 text-[13px]`}><NavigationIcon name={module.icon} className="h-3.5 w-3.5 shrink-0" /><span>{module.label}</span></Link>;
          })}</div> : null}
        </div>;
      })}

      {canManageWorkspaces ? <div className="mt-6 border-t border-[var(--border)] pt-4">
        {!collapsed ? <p className="proveit-label mb-1 px-2">Administration</p> : null}
        {profile?.group === "bod" ? <Link href="/admin/employees" aria-current={pathname.startsWith("/admin/employees") ? "page" : undefined} title={collapsed ? "Employees" : undefined} className={`${navClass(pathname.startsWith("/admin/employees"))} gap-2`}><NavigationIcon name="people" className="h-4 w-4 shrink-0" />{!collapsed ? "Employees" : null}</Link> : null}
        <Link href="/admin/workspaces" aria-current={pathname.startsWith("/admin/workspaces") ? "page" : undefined} title={collapsed ? "Workspace settings" : undefined} className={`${navClass(pathname.startsWith("/admin/workspaces"))} gap-2`}><NavigationIcon name="settings" className="h-4 w-4 shrink-0" />{!collapsed ? "Workspace settings" : null}</Link>
        <Link href="/admin/notion-migration" aria-current={pathname.startsWith("/admin/notion-migration") ? "page" : undefined} title={collapsed ? "Notion migration" : undefined} className={`${navClass(pathname.startsWith("/admin/notion-migration"))} gap-2`}><NavigationIcon name="upload" className="h-4 w-4 shrink-0" />{!collapsed ? "Notion migration" : null}</Link>
      </div> : null}
    </nav>

    <div ref={accountRef} className="relative mt-3 border-t border-[var(--border)] pt-3">
      <div className={`flex items-center ${collapsed ? "flex-col gap-2" : "gap-2"}`}>
        <ThemeToggle />
        <button type="button" aria-label="Open account options" aria-expanded={accountOpen} onClick={() => setAccountOpen((value) => !value)} className="flex min-w-0 flex-1 items-center gap-2 rounded-[var(--radius-md)] p-2 text-left hover:bg-[var(--hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]"><Avatar name={profile?.name} />{!collapsed ? <span className="min-w-0 flex-1"><span className="block truncate text-xs font-medium">{profile?.name}</span><span className="block truncate text-xs text-[var(--text-muted)]">{profile?.employeeId}</span></span> : null}</button>
      </div>
      {accountOpen ? <section aria-label="Account options" className={`absolute bottom-[calc(100%+0.5rem)] z-50 overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-raised)] p-2 shadow-[var(--shadow-md)] ${collapsed ? "left-0 w-64" : "left-0 right-0"}`}><div className="px-3 py-2"><p className="truncate text-sm font-medium">{profile?.name}</p><p className="mt-1 text-xs text-[var(--text-muted)]">Employee ID · {profile?.employeeId}</p></div><Link href="/profile" onClick={() => setAccountOpen(false)} className="block rounded-[var(--radius-md)] px-3 py-2 text-sm hover:bg-[var(--hover)]">Your profile</Link><div className="my-1 border-t border-[var(--border)]" /><button type="button" onClick={() => void logout()} className="block w-full rounded-[var(--radius-md)] px-3 py-2 text-left text-sm font-medium text-[var(--danger)] hover:bg-[var(--danger-soft)]">Sign out</button></section> : null}
    </div>
  </aside>;
}
