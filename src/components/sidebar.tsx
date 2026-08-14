"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { collection, onSnapshot, query, where } from "firebase/firestore";

import { ProveItLogo } from "@/components/proveit-logo";
import { useAuth } from "@/components/auth-provider";
import { getAccessibleWorkspaces } from "@/lib/accessible-workspaces";
import { Workspace } from "@/types/workspace";
import { db } from "@/lib/firebase";

const modules = [
  { segment: "dashboard", label: "Dashboard", icon: "◫" },
  { segment: "documents", label: "Documents", icon: "▤" },
  { segment: "tasks", label: "Tasks", icon: "✓" },
  { segment: "meetings", label: "Meetings", icon: "◷" },
  { segment: "databases", label: "Databases", icon: "▦" },
  { segment: "activity", label: "Recent activity", icon: "◦" },
];

export default function Sidebar() {
  const { profile, firebaseUser } = useAuth();
  const pathname = usePathname();
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [loading, setLoading] = useState(true);
  const [unread, setUnread] = useState(0);
  const [workspaceExpansion, setWorkspaceExpansion] = useState<Record<string, boolean>>({});
  const workspaceId = pathname.match(/^\/workspaces\/([^/]+)/)?.[1];

  useEffect(() => {
    if (!firebaseUser || !workspaceId) return;
    return onSnapshot(query(collection(db, "notifications"), where("recipientUid", "==", firebaseUser.uid)), (snapshot) => setUnread(snapshot.docs.filter((item) => item.data().workspaceId === workspaceId && !item.data().readAt && !item.data().archivedAt).length), (error) => console.error("Failed to load inbox badge from notifications:", error));
  }, [firebaseUser, workspaceId]);

  useEffect(() => {
    if (!profile) return;
    let active = true;
    const currentProfile = profile;

    async function loadWorkspaces() {
      try {
        setLoading(true);
        const accessible = await getAccessibleWorkspaces(currentProfile);
        if (active) setWorkspaces(accessible);
      } catch (error) {
        console.error("Failed to load accessible workspaces:", error);
        if (active) setWorkspaces([]);
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadWorkspaces();
    return () => { active = false; };
  }, [profile]);

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  const toggleWorkspace = (id: string, expanded: boolean) => {
    setWorkspaceExpansion((current) => ({ ...current, [id]: !expanded }));
  };

  return <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-[var(--border)] bg-[var(--sidebar)] px-3 py-4 text-[var(--foreground)] md:flex"><Link href="/" className="mb-6 flex items-center gap-2.5 rounded-lg px-2 py-2 transition hover:bg-[var(--hover)]"><ProveItLogo className="h-6 w-6" priority /><span className="text-sm font-semibold tracking-[-0.02em]">ProveIt</span></Link><nav className="min-h-0 flex-1 overflow-y-auto"><button type="button" aria-label="Open search" onClick={() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }))} className="mb-2 flex w-full items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 py-2 text-sm text-[var(--muted)] hover:bg-[var(--hover)]"><span aria-hidden>⌕</span><span>Search</span><kbd className="ml-auto text-[11px]">⌘K</kbd></button><Link href={workspaceId ? `/workspaces/${workspaceId}/inbox` : "/"} className={`mb-5 flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm transition ${pathname.includes("/inbox") ? "bg-[var(--selected)] font-medium" : "hover:bg-[var(--hover)]"}`}><span aria-hidden>◉</span><span>Inbox</span>{unread > 0 && <span aria-label={`${unread} unread notifications`} className="ml-auto rounded-full bg-[var(--active)] px-1.5 py-0.5 text-[11px]">{unread}</span>}</Link><p className="proveit-label mb-2 px-2">Workspaces</p>{loading ? <p className="px-2 py-2 text-sm text-[var(--subtle)]">Loading…</p> : <div className="space-y-1">{workspaces.map((workspace) => { const workspaceHref = `/workspaces/${workspace.id}`; const isCurrentWorkspace = workspace.id === workspaceId; const expanded = workspace.id in workspaceExpansion ? workspaceExpansion[workspace.id] : isCurrentWorkspace; return <div key={workspace.id}><div className={`flex items-center rounded-lg text-sm transition ${isCurrentWorkspace && pathname === workspaceHref ? "bg-[var(--selected)] font-medium" : "hover:bg-[var(--hover)]"}`}><button type="button" aria-label={`${expanded ? "Collapse" : "Expand"} ${workspace.name}`} aria-expanded={expanded} onClick={() => toggleWorkspace(workspace.id, expanded)} className="grid h-9 w-7 shrink-0 place-items-center rounded-l-lg text-xs text-[var(--subtle)] hover:text-[var(--foreground)]">{expanded ? "⌄" : "›"}</button><Link href={workspaceHref} className="flex min-w-0 flex-1 items-center gap-2 py-2 pr-2"><span className="grid h-5 w-5 shrink-0 place-items-center text-sm">{workspace.icon || "▦"}</span><span className="truncate">{workspace.name}</span></Link></div>{expanded && <div className="mb-3 ml-3 border-l border-black/[0.08] py-1 pl-2">{modules.map((module) => { const href = `${workspaceHref}/${module.segment}`; return <Link key={module.segment} href={href} className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-[13px] transition ${isActive(href) ? "bg-[var(--selected)] font-medium text-[var(--foreground)]" : "text-[var(--muted)] hover:bg-[var(--hover)] hover:text-[var(--foreground)]"}`}><span aria-hidden className="w-3 text-center text-xs">{module.icon}</span>{module.label}</Link>; })}</div>}</div>; })}</div>}{profile?.group === "bod" && <div className="mt-6 border-t border-black/[0.08] pt-4"><p className="proveit-label mb-1 px-2">Administration</p><Link href="/admin/employees" className={`block rounded-md px-2 py-1.5 text-sm transition ${pathname.startsWith("/admin/employees") ? "bg-[var(--selected)] font-medium" : "hover:bg-[var(--hover)]"}`}>Employees</Link><Link href="/admin/workspaces" className={`block rounded-md px-2 py-1.5 text-sm transition ${pathname.startsWith("/admin/workspaces") ? "bg-[var(--selected)] font-medium" : "hover:bg-[var(--hover)]"}`}>Workspace settings</Link></div>}</nav>{profile && <div className="mt-3 flex items-center gap-2 border-t border-black/[0.08] px-2 pt-4"><div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[var(--active)] text-xs font-semibold text-[var(--muted)]">{profile.name.slice(0, 1).toUpperCase()}</div><div className="min-w-0"><p className="truncate text-xs font-medium">{profile.name}</p><p className="truncate text-[11px] text-[var(--subtle)]">{profile.employeeId}</p></div></div>}</aside>;
}
