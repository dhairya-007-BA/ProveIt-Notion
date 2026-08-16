"use client";

import Link from "next/link";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import Sidebar from "@/components/sidebar";
import { useAuth } from "@/components/auth-provider";
import { db } from "@/lib/firebase";
import { getAccessibleWorkspaces } from "@/lib/accessible-workspaces";
import { Workspace } from "@/types/workspace";

type HomeTask = { id: string; workspaceId: string; title: string; priority: string; status: string; dueDate?: Date };
type HomeActivity = { id: string; workspaceId: string; description: string; userName?: string; createdAt?: Date };

export default function Home() {
  const router = useRouter();
  const { firebaseUser, profile, loading } = useAuth();
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [tasks, setTasks] = useState<HomeTask[]>([]);
  const [activity, setActivity] = useState<HomeActivity[]>([]);
  const [dashboardLoading, setDashboardLoading] = useState(true);

  useEffect(() => { if (!loading && !firebaseUser) router.replace("/login"); }, [firebaseUser, loading, router]);

  useEffect(() => {
    if (!profile?.active) return;
    let active = true;
    const unsubs: (() => void)[] = [];
    void getAccessibleWorkspaces(profile).then((accessible) => {
      if (!active) return;
      setWorkspaces(accessible);
      if (!accessible.length) { setDashboardLoading(false); return; }
      for (const workspace of accessible) {
        unsubs.push(onSnapshot(query(collection(db, "tasks"), where("workspaceId", "==", workspace.id)), (snapshot) => {
          if (!active) return;
          setTasks((current) => [...current.filter((task) => task.workspaceId !== workspace.id), ...snapshot.docs.filter((item) => item.data().archived !== true).map((item) => ({ id: item.id, workspaceId: workspace.id, title: item.data().title || "Untitled task", priority: item.data().priority || "medium", status: item.data().status || "todo", dueDate: item.data().dueDate?.toDate() }))]);
        }));
        unsubs.push(onSnapshot(query(collection(db, "activity"), where("workspaceId", "==", workspace.id)), (snapshot) => {
          if (!active) return;
          setActivity((current) => [...current.filter((event) => event.workspaceId !== workspace.id), ...snapshot.docs.map((item) => ({ id: item.id, workspaceId: workspace.id, description: item.data().description || "Updated workspace", userName: item.data().userName || undefined, createdAt: item.data().createdAt?.toDate() }))]);
        }));
      }
      setDashboardLoading(false);
    }).catch(() => { if (active) setDashboardLoading(false); });
    return () => { active = false; unsubs.forEach((unsubscribe) => unsubscribe()); };
  }, [profile]);

  const focusTasks = useMemo(() => {
    const now = new Date();
    const soon = new Date(now); soon.setDate(soon.getDate() + 7);
    return tasks.filter((task) => task.priority === "urgent" || task.priority === "high" || (task.dueDate && task.dueDate <= soon && task.status !== "done")).sort((left, right) => (left.dueDate?.getTime() || Number.MAX_SAFE_INTEGER) - (right.dueDate?.getTime() || Number.MAX_SAFE_INTEGER)).slice(0, 5);
  }, [tasks]);
  const recentActivity = useMemo(() => [...activity].sort((left, right) => (right.createdAt?.getTime() || 0) - (left.createdAt?.getTime() || 0)).slice(0, 6), [activity]);
  const hasBusiness = workspaces.some((workspace) => workspace.id === "business");

  if (loading) return <main className="grid min-h-screen place-items-center bg-[var(--background)] text-sm text-[var(--muted)]">Loading ProveIt workspace…</main>;
  if (!firebaseUser) return null;
  if (!profile || !profile.active) return <main className="grid min-h-screen place-items-center bg-[var(--background)] px-5"><div className="proveit-card max-w-md p-7"><h1 className="proveit-heading text-xl font-semibold">{profile ? "Account disabled" : "Profile not found"}</h1><p className="mt-2 text-sm leading-6 text-[var(--muted)]">{profile ? "Contact a ProveIt administrator." : "Your authentication account exists, but no employee profile was found."}</p></div></main>;

  const firstName = profile.name.split(" ")[0] || profile.name;
  return <main className="flex min-h-screen bg-[var(--background)]"><Sidebar /><section className="min-w-0 flex-1 px-5 py-7 sm:px-8 md:px-10"><div className="mx-auto max-w-[1400px]"><header className="border-b border-[var(--border)] pb-6"><div><p className="proveit-label">Workspace command center</p><h1 className="proveit-heading mt-1 text-3xl font-semibold tracking-[-0.045em] sm:text-4xl">Welcome, {firstName}.</h1><p className="mt-2 text-sm text-[var(--muted)]">{profile.employeeId} · {profile.group}</p></div></header><div className="mt-7 grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(340px,0.8fr)]"><DashboardSection title="Your focus" action={hasBusiness ? <Link href="/workspaces/business/tasks" className="text-sm font-medium text-[var(--secondary)]">Open Business tasks</Link> : undefined}>{focusTasks.length ? <div className="divide-y divide-[var(--border)]">{focusTasks.map((task) => <Link key={task.id} href={`/workspaces/${task.workspaceId}/tasks?task=${task.id}`} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0 hover:text-[var(--secondary)]"><div className="min-w-0"><p className="truncate text-sm font-medium">{task.title}</p><p className="mt-1 text-xs capitalize text-[var(--muted)]">{task.workspaceId} · {task.priority} priority</p></div><time className="shrink-0 text-xs text-[var(--muted)]">{task.dueDate ? task.dueDate.toLocaleDateString() : "High priority"}</time></Link>)}</div> : <EmptyState message={dashboardLoading ? "Loading your work…" : "Nothing urgent right now."} />}</DashboardSection><DashboardSection title="Quick actions"><div className="grid gap-2">{hasBusiness && <QuickLink href="/workspaces/business/tasks">Open Business board</QuickLink>}{workspaces.some((workspace) => workspace.id === "technology") && <QuickLink href="/workspaces/technology/tasks">View Technology tasks</QuickLink>}{profile.group === "bod" && <><QuickLink href="/admin/employees">Employees</QuickLink><QuickLink href="/admin/workspaces">Workspace settings</QuickLink></>}</div></DashboardSection></div><div className="mt-6 grid gap-6 lg:grid-cols-2"><DashboardSection title="Workspace overview"><div className="grid gap-2 sm:grid-cols-2">{workspaces.map((workspace) => { const workspaceTasks = tasks.filter((task) => task.workspaceId === workspace.id); const open = workspaceTasks.filter((task) => task.status !== "done").length; return <Link key={workspace.id} href={`/workspaces/${workspace.id}/tasks`} className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 transition hover:border-[var(--border-strong)] hover:bg-[var(--hover)]"><p className="proveit-heading text-sm font-semibold">{workspace.name}</p><p className="mt-2 text-sm text-[var(--muted)]">{dashboardLoading ? "Loading tasks…" : `${open} open task${open === 1 ? "" : "s"}`}</p></Link>; })}</div>{!dashboardLoading && !workspaces.length && <EmptyState message="No workspaces are currently available." />}</DashboardSection><DashboardSection title="Recent activity"><div className="divide-y divide-[var(--border)]">{recentActivity.map((event) => <div key={event.id} className="py-3 first:pt-0 last:pb-0"><p className="text-sm">{event.description}</p><p className="mt-1 text-xs text-[var(--muted)]">{event.userName ? `${event.userName} · ` : ""}{event.createdAt?.toLocaleString() || "Just now"}</p></div>)}{!recentActivity.length && <EmptyState message={dashboardLoading ? "Loading activity…" : "No recent activity yet."} />}</div></DashboardSection></div>{hasBusiness && <section className="mt-6 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-5 py-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="proveit-heading text-sm font-semibold">Business snapshot</p><p className="mt-1 text-sm text-[var(--muted)]">{tasks.filter((task) => task.workspaceId === "business" && task.status !== "done").length} open · {tasks.filter((task) => task.workspaceId === "business" && task.status === "in_progress").length} in progress · {tasks.filter((task) => task.workspaceId === "business" && task.status === "done").length} done</p></div><Link href="/workspaces/business/tasks" className="text-sm font-medium text-[var(--secondary)]">Open workspace</Link></div></section>}</div></section></main>;
}

function DashboardSection({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) { return <section className="proveit-card p-5"><header className="mb-4 flex items-center justify-between gap-3"><h2 className="proveit-heading text-base font-semibold">{title}</h2>{action}</header>{children}</section>; }
function EmptyState({ message }: { message: string }) { return <p className="py-5 text-sm text-[var(--muted)]">{message}</p>; }
function QuickLink({ href, children }: { href: string; children: React.ReactNode }) { return <Link href={href} className="group flex items-center justify-between rounded-lg border border-[var(--border)] px-3 py-2.5 text-sm font-medium transition hover:border-[var(--secondary)] hover:bg-[var(--hover)]"><span>{children}</span><span aria-hidden className="text-[var(--secondary)] transition group-hover:translate-x-0.5">›</span></Link>; }
