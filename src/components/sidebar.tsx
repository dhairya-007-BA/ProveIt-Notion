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
  const workspaceId = pathname.match(/^\/workspaces\/([^/]+)/)?.[1];

  useEffect(() => {
    if (!firebaseUser || !workspaceId) return;
    return onSnapshot(query(collection(db, "notifications"), where("recipientUid", "==", firebaseUser.uid)), (snapshot) => setUnread(snapshot.docs.filter((item) => item.data().workspaceId === workspaceId && !item.data().readAt && !item.data().archivedAt).length), (error) => console.error("Failed to load inbox badge:", error));
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

  return <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-[var(--border)] bg-[var(--sidebar)] px-2 py-3 text-[var(--foreground)] md:flex"><Link href="/" className="mb-5 flex items-center gap-2 rounded-md px-2 py-1.5 transition hover:bg-[var(--hover)]"><ProveItLogo className="h-6 w-6" priority /><span className="text-sm font-semibold tracking-[-0.01em]">ProveIt</span></Link><nav className="min-h-0 flex-1 overflow-y-auto"><Link href={workspaceId ? `/workspaces/${workspaceId}/inbox` : "/"} className={`mb-4 flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition ${pathname.includes("/inbox") ? "bg-[var(--selected)]" : "hover:bg-[var(--hover)]"}`}><span aria-hidden>◉</span><span>Inbox</span>{unread > 0 && <span aria-label={`${unread} unread notifications`} className="ml-auto rounded-full bg-[var(--active)] px-1.5 py-0.5 text-[11px]">{unread}</span>}</Link><p className="proveit-label mb-1 px-2">Workspaces</p>{loading ? <p className="px-2 py-2 text-sm text-[var(--subtle)]">Loading…</p> : <div className="space-y-0.5">{workspaces.map((workspace) => { const workspaceHref = `/workspaces/${workspace.id}`; const isCurrentWorkspace = workspace.id === workspaceId; return <div key={workspace.id}><Link href={workspaceHref} className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition ${isCurrentWorkspace && pathname === workspaceHref ? "bg-[var(--selected)] font-medium" : "hover:bg-[var(--hover)]"}`}><span className="grid h-5 w-5 shrink-0 place-items-center text-sm">{workspace.icon || "▦"}</span><span className="truncate">{workspace.name}</span><span aria-hidden className="ml-auto text-xs text-[var(--subtle)]">{isCurrentWorkspace ? "⌄" : "›"}</span></Link>{isCurrentWorkspace && <div className="mb-2 ml-3 border-l border-black/[0.08] py-1 pl-2">{modules.map((module) => { const href = `${workspaceHref}/${module.segment}`; return <Link key={module.segment} href={href} className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-[13px] transition ${isActive(href) ? "bg-[var(--selected)] font-medium text-[var(--foreground)]" : "text-[var(--muted)] hover:bg-[var(--hover)] hover:text-[var(--foreground)]"}`}><span aria-hidden className="w-3 text-center text-xs">{module.icon}</span>{module.label}</Link>; })}</div>}</div>; })}</div>}{profile?.group === "bod" && <div className="mt-6 border-t border-black/[0.08] pt-4"><p className="proveit-label mb-1 px-2">Administration</p><Link href="/admin/employees" className={`block rounded-md px-2 py-1.5 text-sm transition ${pathname.startsWith("/admin/employees") ? "bg-[var(--selected)] font-medium" : "hover:bg-[var(--hover)]"}`}>Employees</Link><Link href="/admin/workspaces" className={`block rounded-md px-2 py-1.5 text-sm transition ${pathname.startsWith("/admin/workspaces") ? "bg-[var(--selected)] font-medium" : "hover:bg-[var(--hover)]"}`}>Workspace settings</Link></div>}</nav>{profile && <div className="mt-3 flex items-center gap-2 border-t border-black/[0.08] px-2 pt-3"><div className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[var(--active)] text-xs font-semibold text-[var(--muted)]">{profile.name.slice(0, 1).toUpperCase()}</div><div className="min-w-0"><p className="truncate text-xs font-medium">{profile.name}</p><p className="truncate text-[11px] text-[var(--subtle)]">{profile.employeeId}</p></div></div>}</aside>;
}
