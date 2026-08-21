"use client";

import Link from "next/link";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";

import { NavigationIcon } from "@/components/app-navigation";
import Sidebar from "@/components/sidebar";
import { useAuth } from "@/components/auth-provider";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { TaskPriorityBadge, TaskStatusBadge } from "@/components/ui/task-metadata";
import { getAccessibleWorkspaces } from "@/lib/accessible-workspaces";
import { db } from "@/lib/firebase";
import type { TaskPriority, TaskStatus } from "@/types/task";
import type { Workspace } from "@/types/workspace";

type HomeTask = { id: string; workspaceId: string; title: string; priority: TaskPriority; status: TaskStatus; assigneeId?: string; dueDate?: Date };
type HomeActivity = { id: string; workspaceId: string; description: string; userName?: string; entityType?: string; entityId?: string; createdAt?: Date };
const FIRESTORE_IN_QUERY_LIMIT = 30;

function chunks<T>(items: T[], size: number) {
  return Array.from({ length: Math.ceil(items.length / size) }, (_, index) => items.slice(index * size, (index + 1) * size));
}

function taskStatus(value: unknown): TaskStatus {
  return value === "in_progress" || value === "blocked" || value === "done" ? value : "todo";
}

function taskPriority(value: unknown): TaskPriority {
  return value === "low" || value === "high" || value === "urgent" ? value : "medium";
}

function startOfToday() { const value = new Date(); value.setHours(0, 0, 0, 0); return value; }
function endOfToday() { const value = startOfToday(); value.setDate(value.getDate() + 1); return value; }
function endOfWeek() { const value = startOfToday(); value.setDate(value.getDate() + 8); return value; }
function isOpen(task: HomeTask) { return task.status !== "done"; }
function isOverdue(task: HomeTask) { return Boolean(task.dueDate && task.dueDate < startOfToday() && isOpen(task)); }

function dueLabel(date?: Date) {
  if (!date) return "No due date";
  const days = Math.ceil((date.getTime() - startOfToday().getTime()) / 86_400_000);
  if (days < 0) return `${Math.abs(days)}d overdue`;
  if (days === 0) return "Due today";
  if (days === 1) return "Due tomorrow";
  if (days <= 7) return `Due in ${days} days`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function activityHref(activity: HomeActivity) {
  if (!activity.entityId) return `/workspaces/${activity.workspaceId}/activity`;
  if (activity.entityType === "task") return `/workspaces/${activity.workspaceId}/tasks/${activity.entityId}`;
  if (activity.entityType === "meeting") return `/workspaces/${activity.workspaceId}/meetings/${activity.entityId}`;
  if (activity.entityType === "document") return `/workspaces/${activity.workspaceId}/documents/${activity.entityId}`;
  return `/workspaces/${activity.workspaceId}/activity`;
}

export default function Home() {
  const router = useRouter();
  const { firebaseUser, profile, loading } = useAuth();
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [tasks, setTasks] = useState<HomeTask[]>([]);
  const [activity, setActivity] = useState<HomeActivity[]>([]);
  const [dashboardLoading, setDashboardLoading] = useState(true);
  const [dashboardError, setDashboardError] = useState("");

  useEffect(() => { if (!loading && !firebaseUser) router.replace("/login"); }, [firebaseUser, loading, router]);
  useEffect(() => {
    if (!profile?.active) return;
    let active = true;
    const unsubscribes: Array<() => void> = [];
    void getAccessibleWorkspaces(profile).then((accessible) => {
      if (!active) return;
      setDashboardLoading(true);
      setDashboardError("");
      setTasks([]);
      setActivity([]);
      setWorkspaces(accessible);
      const groups = chunks(accessible.map((workspace) => workspace.id), FIRESTORE_IN_QUERY_LIMIT);
      if (!groups.length) { setDashboardLoading(false); return; }
      const pending = new Set(groups.flatMap((_, index) => [`tasks:${index}`, `activity:${index}`]));
      const resolve = (key: string) => { pending.delete(key); if (!pending.size && active) setDashboardLoading(false); };
      const fail = (key: string) => { if (active) setDashboardError("Some command-center information could not be loaded. Live workspace pages remain available."); resolve(key); };

      groups.forEach((workspaceIds, index) => {
        const workspaceIdSet = new Set(workspaceIds);
        unsubscribes.push(onSnapshot(query(collection(db, "tasks"), where("workspaceId", "in", workspaceIds)), (snapshot) => {
          if (!active) return;
          setTasks((current) => [...current.filter((task) => !workspaceIdSet.has(task.workspaceId)), ...snapshot.docs.filter((item) => item.data().archived !== true).map((item) => ({ id: item.id, workspaceId: String(item.data().workspaceId), title: typeof item.data().title === "string" && item.data().title.trim() ? item.data().title : "Untitled task", priority: taskPriority(item.data().priority), status: taskStatus(item.data().status), assigneeId: typeof item.data().assigneeId === "string" ? item.data().assigneeId : undefined, dueDate: item.data().dueDate?.toDate?.() }))]);
          resolve(`tasks:${index}`);
        }, () => fail(`tasks:${index}`)));
        unsubscribes.push(onSnapshot(query(collection(db, "activity"), where("workspaceId", "in", workspaceIds)), (snapshot) => {
          if (!active) return;
          setActivity((current) => [...current.filter((event) => !workspaceIdSet.has(event.workspaceId)), ...snapshot.docs.map((item) => ({ id: item.id, workspaceId: String(item.data().workspaceId), description: typeof item.data().description === "string" ? item.data().description : "Updated workspace", userName: typeof item.data().userName === "string" ? item.data().userName : undefined, entityType: typeof item.data().entityType === "string" ? item.data().entityType : undefined, entityId: typeof item.data().entityId === "string" ? item.data().entityId : undefined, createdAt: item.data().createdAt?.toDate?.() }))]);
          resolve(`activity:${index}`);
        }, () => fail(`activity:${index}`)));
      });
    }).catch(() => { if (active) { setDashboardError("Your command center could not be loaded. Try again or open a workspace directly."); setDashboardLoading(false); } });
    return () => { active = false; unsubscribes.forEach((unsubscribe) => unsubscribe()); };
  }, [profile]);

  const myTasks = useMemo(() => tasks.filter((task) => task.assigneeId === firebaseUser?.uid && isOpen(task)), [firebaseUser?.uid, tasks]);
  const focusTasks = useMemo(() => myTasks.filter((task) => isOverdue(task) || task.priority === "urgent" || task.priority === "high" || (task.dueDate && task.dueDate < endOfWeek())).sort((left, right) => Number(isOverdue(right)) - Number(isOverdue(left)) || (left.dueDate?.getTime() || Number.MAX_SAFE_INTEGER) - (right.dueDate?.getTime() || Number.MAX_SAFE_INTEGER)).slice(0, 6), [myTasks]);
  const recentActivity = useMemo(() => [...activity].sort((left, right) => (right.createdAt?.getTime() || 0) - (left.createdAt?.getTime() || 0)).slice(0, 6), [activity]);
  const summary = useMemo(() => ({ assigned: myTasks.length, overdue: myTasks.filter(isOverdue).length, today: myTasks.filter((task) => task.dueDate && task.dueDate >= startOfToday() && task.dueDate < endOfToday()).length, week: myTasks.filter((task) => task.dueDate && task.dueDate >= startOfToday() && task.dueDate < endOfWeek()).length }), [myTasks]);

  if (loading) return <LoadingScreen />;
  if (!firebaseUser) return null;
  if (!profile || !profile.active) return <main className="grid min-h-screen place-items-center bg-[var(--background)] px-5"><Card tone="raised" className="max-w-md p-7"><h1 className="proveit-heading text-xl font-semibold">{profile ? "Account disabled" : "Profile not found"}</h1><p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">{profile ? "Contact a ProveIt administrator." : "Your authentication account exists, but no employee profile was found."}</p></Card></main>;

  const firstName = profile.name.split(" ")[0] || profile.name;
  return <main className="flex min-h-screen bg-[var(--background)]"><Sidebar /><section className="min-w-0 flex-1 px-4 py-6 sm:px-7 md:px-9 lg:px-10"><div className="mx-auto max-w-[1320px]">
    <header className="flex flex-col gap-5 border-b border-[var(--border)] pb-6 lg:flex-row lg:items-end lg:justify-between">
      <div><p className="proveit-label">Workspace command center</p><h1 className="proveit-heading mt-1 text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">Welcome back, {firstName}.</h1><p className="mt-2 max-w-xl text-sm leading-6 text-[var(--text-muted)]">A focused view of the work that needs your attention across ProveIt.</p></div>
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--border)] shadow-[var(--shadow-sm)] sm:grid-cols-4"><SummaryMetric label="Assigned" value={summary.assigned} /><SummaryMetric label="Due today" value={summary.today} /><SummaryMetric label="This week" value={summary.week} /><SummaryMetric label="Overdue" value={summary.overdue} danger={summary.overdue > 0} /></div>
    </header>

    {dashboardError ? <p role="alert" className="proveit-feedback proveit-feedback-warning mt-5">{dashboardError}</p> : null}

    <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(19rem,0.65fr)]">
      <DashboardCard title="Your focus" description="Assigned work that is overdue, high priority, or due soon." action={workspaces.length ? <Link href={`/workspaces/${workspaces[0].id}/tasks`} className="proveit-interaction-link text-sm font-medium">View tasks</Link> : undefined}>
        {focusTasks.length ? <div className="divide-y divide-[var(--border)]">{focusTasks.map((task) => <Link key={task.id} href={`/workspaces/${task.workspaceId}/tasks/${task.id}`} className="group grid gap-3 py-3 first:pt-0 last:pb-0 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"><div className="min-w-0"><p className="truncate text-sm font-semibold group-hover:text-[var(--brand-primary)]">{task.title}</p><div className="mt-2 flex flex-wrap items-center gap-2"><TaskStatusBadge status={task.status} /><TaskPriorityBadge priority={task.priority} /><span className="text-xs capitalize text-[var(--text-muted)]">{task.workspaceId}</span></div></div><span className={`text-xs font-medium ${isOverdue(task) ? "text-[var(--danger)]" : "text-[var(--text-muted)]"}`}>{dueLabel(task.dueDate)}</span></Link>)}</div> : <EmptyState title={dashboardLoading ? "Loading your focus…" : "You’re clear for now"} description={dashboardLoading ? "ProveIt is gathering your assigned work." : "No assigned high-priority or time-sensitive tasks need attention."} icon={<NavigationIcon name="task" className="h-5 w-5" />} />}
      </DashboardCard>

      <DashboardCard title="Quick actions" description="Go directly to active company work."><div className="grid gap-2">{workspaces.slice(0, 3).map((workspace) => <QuickLink key={workspace.id} href={`/workspaces/${workspace.id}/tasks`} icon="task">{workspace.name} tasks</QuickLink>)}{profile.group === "bod" ? <QuickLink href="/admin/employees" icon="people">Manage employees</QuickLink> : null}{!workspaces.length && !dashboardLoading ? <EmptyState title="No actions available" description="Your accessible workspaces will appear here." /> : null}</div></DashboardCard>
    </div>

    <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
      <DashboardCard title="Workspace overview" description="A lightweight health check across the areas you can access."><div className="grid gap-3 sm:grid-cols-2">{workspaces.map((workspace) => {
        const workspaceTasks = tasks.filter((task) => task.workspaceId === workspace.id);
        const open = workspaceTasks.filter(isOpen).length;
        const inProgress = workspaceTasks.filter((task) => task.status === "in_progress").length;
        const overdue = workspaceTasks.filter(isOverdue).length;
        return <Link key={workspace.id} href={`/workspaces/${workspace.id}/tasks`} className="group rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] p-4 transition hover:-translate-y-0.5 hover:border-[var(--border-strong)] hover:shadow-[var(--shadow-sm)]"><div className="flex items-center justify-between gap-3"><span className="grid h-8 w-8 place-items-center rounded-[var(--radius-md)] bg-[var(--info-soft)] text-sm font-semibold text-[var(--info)]">{workspace.name.slice(0, 1).toUpperCase()}</span><NavigationIcon name="chevron" className="h-4 w-4 text-[var(--text-subtle)] transition group-hover:translate-x-0.5 group-hover:text-[var(--brand-primary)]" /></div><p className="proveit-heading mt-3 text-sm font-semibold">{workspace.name}</p><p className="mt-2 text-xs text-[var(--text-muted)]">{dashboardLoading ? "Loading work…" : `${open} open · ${inProgress} in progress`}</p>{!dashboardLoading && overdue > 0 ? <p className="mt-1 text-xs font-medium text-[var(--danger)]">{overdue} overdue</p> : null}</Link>;
      })}</div>{!dashboardLoading && !workspaces.length ? <EmptyState className="mt-3" title="No workspaces available" description="Ask an administrator if you believe you should have access." icon={<NavigationIcon name="workspace" className="h-5 w-5" />} /> : null}</DashboardCard>

      <DashboardCard title="Recent activity" description="The latest changes across your accessible workspaces." action={workspaces[0] ? <Link href={`/workspaces/${workspaces[0].id}/activity`} className="proveit-interaction-link text-sm font-medium">Open activity</Link> : undefined}>
        {recentActivity.length ? <div className="divide-y divide-[var(--border)]">{recentActivity.map((event) => <Link key={event.id} href={activityHref(event)} className="flex gap-3 py-3 first:pt-0 last:pb-0 hover:text-[var(--brand-primary)]"><span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[var(--brand-secondary)]" /><span className="min-w-0"><span className="block text-sm leading-5">{event.description}</span><span className="mt-1 block text-xs capitalize text-[var(--text-muted)]">{event.userName ? `${event.userName} · ` : ""}{event.workspaceId} · {event.createdAt?.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) || "Just now"}</span></span></Link>)}</div> : <EmptyState title={dashboardLoading ? "Loading activity…" : "No recent activity"} description={dashboardLoading ? "Recent workspace changes are on the way." : "New work and collaboration updates will appear here."} icon={<NavigationIcon name="activity" className="h-5 w-5" />} />}
      </DashboardCard>
    </div>
  </div></section></main>;
}

function LoadingScreen() { return <main className="grid min-h-screen place-items-center bg-[var(--background)] px-5"><div className="text-center"><span className="mx-auto block h-8 w-8 animate-spin rounded-full border-2 border-[var(--border-strong)] border-t-[var(--brand-primary)]" /><p className="mt-3 text-sm text-[var(--text-muted)]">Loading ProveIt Workspace…</p></div></main>; }
function SummaryMetric({ danger = false, label, value }: { danger?: boolean; label: string; value: number }) { return <div className="min-w-[6.5rem] bg-[var(--surface)] px-3 py-2.5"><p className={`proveit-heading text-lg font-semibold ${danger ? "text-[var(--danger)]" : "text-[var(--text)]"}`}>{value}</p><p className="mt-0.5 text-[11px] font-medium text-[var(--text-muted)]">{label}</p></div>; }
function DashboardCard({ action, children, description, title }: { action?: ReactNode; children: ReactNode; description?: string; title: string }) { return <Card tone="raised" className="p-5"><CardHeader className="mb-4"><div><h2 className="proveit-heading text-base font-semibold">{title}</h2>{description ? <p className="mt-1 text-sm leading-5 text-[var(--text-muted)]">{description}</p> : null}</div>{action}</CardHeader>{children}</Card>; }
function QuickLink({ children, href, icon }: { children: ReactNode; href: string; icon: "people" | "task" }) { return <Link href={href} className="group flex min-h-11 items-center gap-3 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-sm font-medium transition hover:border-[var(--border-strong)] hover:bg-[var(--hover)]"><span className="grid h-8 w-8 place-items-center rounded-[var(--radius-md)] bg-[var(--info-soft)] text-[var(--info)]"><NavigationIcon name={icon} className="h-4 w-4" /></span><span className="min-w-0 flex-1 truncate">{children}</span><NavigationIcon name="chevron" className="h-4 w-4 text-[var(--text-subtle)] transition group-hover:translate-x-0.5 group-hover:text-[var(--brand-primary)]" /></Link>; }
