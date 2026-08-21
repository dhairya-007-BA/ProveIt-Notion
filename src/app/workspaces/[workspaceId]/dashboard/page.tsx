"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { collection, doc, onSnapshot, query, where } from "firebase/firestore";
import { useParams, useRouter } from "next/navigation";

import Sidebar from "@/components/sidebar";
import { useAuth } from "@/components/auth-provider";
import { TaskPriorityBadge, TaskStatusBadge } from "@/components/ui/task-metadata";
import { db } from "@/lib/firebase";
import type { TaskPriority, TaskStatus } from "@/types/task";

type Task = { id: string; title: string; status: TaskStatus; priority: TaskPriority; assigneeId?: string | null; dueDate?: Date };
type Meeting = { id: string; title: string; updatedAt?: Date };
type Document = { id: string; title: string; updatedAt?: Date };
type Activity = { id: string; description: string; createdAt?: Date };
type WorkspaceSummary = { name: string; icon: string };

const taskStatuses: TaskStatus[] = ["todo", "in_progress", "blocked", "done"];
const taskPriorities: TaskPriority[] = ["low", "medium", "high", "urgent"];
const taskStatus = (value: unknown): TaskStatus => typeof value === "string" && taskStatuses.includes(value as TaskStatus) ? value as TaskStatus : "todo";
const taskPriority = (value: unknown): TaskPriority => typeof value === "string" && taskPriorities.includes(value as TaskPriority) ? value as TaskPriority : "medium";

export default function DashboardPage() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const router = useRouter();
  const { firebaseUser, profile, loading } = useAuth();
  const [workspace, setWorkspace] = useState<WorkspaceSummary | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!loading && !firebaseUser) router.replace("/login");
  }, [firebaseUser, loading, router]);

  useEffect(() => {
    if (!firebaseUser || !profile || !workspaceId) return;
    return onSnapshot(doc(db, "workspaces", workspaceId), (snapshot) => {
      if (!snapshot.exists()) return setWorkspace(null);
      const data = snapshot.data();
      setWorkspace({ name: data.name || "Workspace", icon: data.icon || "📁" });
    }, (listenerError) => {
      console.error("Failed to load dashboard workspace:", listenerError);
      setError("This workspace overview could not be loaded.");
    });
  }, [firebaseUser, profile, workspaceId]);

  useEffect(() => {
    if (!firebaseUser || !profile || !workspaceId) return;
    return onSnapshot(query(collection(db, "tasks"), where("workspaceId", "==", workspaceId)), (snapshot) => {
      setTasks(snapshot.docs.map((item) => {
        const data = item.data();
        return { id: item.id, title: data.title || "Untitled task", status: taskStatus(data.status), priority: taskPriority(data.priority), assigneeId: data.assigneeId ?? null, dueDate: data.dueDate?.toDate() };
      }).filter((_, index) => snapshot.docs[index].data().archived !== true));
    }, (listenerError) => {
      console.error("Failed to load dashboard tasks:", listenerError);
      setError("Tasks could not be loaded for this overview.");
    });
  }, [firebaseUser, profile, workspaceId]);

  useEffect(() => {
    if (!firebaseUser || !profile || !workspaceId) return;
    return onSnapshot(query(collection(db, "documents"), where("workspaceId", "==", workspaceId)), (snapshot) => setDocuments(snapshot.docs.map((item) => ({ id: item.id, title: item.data().title || "Untitled document", updatedAt: item.data().updatedAt?.toDate() })).sort((left, right) => (right.updatedAt?.getTime() || 0) - (left.updatedAt?.getTime() || 0)).slice(0, 5)), () => setError("Documents could not be loaded for this overview."));
  }, [firebaseUser, profile, workspaceId]);

  useEffect(() => {
    if (!firebaseUser || !profile || !workspaceId) return;
    return onSnapshot(query(collection(db, "meetings"), where("workspaceId", "==", workspaceId)), (snapshot) => {
      setMeetings(snapshot.docs.map((item) => {
        const data = item.data();
        return { id: item.id, title: data.title || "Untitled meeting", updatedAt: data.updatedAt?.toDate() };
      }));
    }, (listenerError) => {
      console.error("Failed to load dashboard meetings:", listenerError);
      setError("Meetings could not be loaded for this overview.");
    });
  }, [firebaseUser, profile, workspaceId]);

  useEffect(() => {
    if (!firebaseUser || !profile || !workspaceId) return;
    return onSnapshot(query(collection(db, "activity"), where("workspaceId", "==", workspaceId)), (snapshot) => {
      setActivity(snapshot.docs.map((item) => ({ id: item.id, description: item.data().description || "Updated workspace", createdAt: item.data().createdAt?.toDate() })).sort((left, right) => (right.createdAt?.getTime() || 0) - (left.createdAt?.getTime() || 0)));
    }, (listenerError) => {
      console.error("Failed to load dashboard activity:", listenerError);
      setError("Recent activity could not be loaded for this overview.");
    });
  }, [firebaseUser, profile, workspaceId]);

  const counts = useMemo(() => ({
    total: tasks.length,
    active: tasks.filter((task) => task.status === "in_progress").length,
    completed: tasks.filter((task) => task.status === "done").length,
    highPriority: tasks.filter((task) => task.priority === "high" || task.priority === "urgent").length,
  }), [tasks]);
  const openTasks = tasks.filter((task) => task.status !== "done").sort((left, right) => {
    const priority: Record<TaskPriority, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
    return priority[left.priority] - priority[right.priority];
  }).slice(0, 6);
  const recentMeetings = [...meetings].sort((left, right) => (right.updatedAt?.getTime() || 0) - (left.updatedAt?.getTime() || 0)).slice(0, 5);
  const myTasks = tasks.filter((task) => task.assigneeId === firebaseUser?.uid && task.status !== "done");
  const overdue = tasks.filter((task) => task.status !== "done" && task.dueDate && task.dueDate < new Date());

  if (loading) return <main className="grid min-h-screen place-items-center text-sm text-[var(--muted)]">Loading dashboard…</main>;
  if (!firebaseUser || !profile) return null;

  return <main className="flex min-h-screen bg-[var(--background)]"><Sidebar /><section className="proveit-content"><div className="proveit-content-inner"><Link href={`/workspaces/${workspaceId}`} className="proveit-back-link px-1">← Back to workspace</Link><header className="proveit-page-header"><div className="flex items-center gap-3"><span className="grid h-12 w-12 place-items-center rounded-xl border border-[var(--border)] bg-[var(--surface)] text-2xl shadow-[var(--shadow-sm)]">{workspace?.icon || "Workspace"}</span><div><p className="proveit-label">{workspace?.name || "Workspace"}</p><h1 className="proveit-page-title">Dashboard</h1></div></div><Link href={`/workspaces/${workspaceId}/tasks`} className="proveit-primary-button">View tasks</Link></header><p className="mt-4 max-w-2xl text-sm leading-6 text-[var(--muted)]">A live overview of the work, priorities, and meetings in this workspace.</p>{error && <p role="alert" className="mt-4 text-sm text-[var(--danger)]">{error}</p>}<section className="mt-8 grid gap-px overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--border)] shadow-[var(--shadow-sm)] sm:grid-cols-2 xl:grid-cols-4"><Metric label="Open tasks" value={counts.total - counts.completed} href={`/workspaces/${workspaceId}/tasks`} /><Metric label="My tasks" value={myTasks.length} href={`/workspaces/${workspaceId}/tasks`} /><Metric label="Overdue" value={overdue.length} href={`/workspaces/${workspaceId}/tasks`} /><Metric label="In progress" value={counts.active} href={`/workspaces/${workspaceId}/tasks`} /></section><div className="mt-8 grid gap-8 lg:grid-cols-2"><DashboardList title="Open tasks" href={`/workspaces/${workspaceId}/tasks`} action="View all" empty="No open tasks in this workspace.">{openTasks.map((task) => { const isOverdue = Boolean(task.dueDate && task.dueDate < new Date()); return <Link key={task.id} href={`/workspaces/${workspaceId}/tasks?task=${task.id}`} className="group flex flex-col gap-3 rounded-lg px-3 py-3 transition hover:bg-[var(--hover)] sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><p className="truncate text-sm font-medium">{task.title}</p><span className="mt-2 flex flex-wrap items-center gap-2"><TaskStatusBadge status={task.status} /><TaskPriorityBadge priority={task.priority} /></span></div>{task.dueDate && <time className={`shrink-0 text-xs ${isOverdue ? "font-semibold text-[var(--danger)]" : "text-[var(--muted)]"}`}>{isOverdue ? "Overdue · " : "Due · "}{task.dueDate.toLocaleDateString()}</time>}</Link>; })}</DashboardList><DashboardList title="Upcoming meetings" href={`/workspaces/${workspaceId}/meetings`} action="View all" empty="No meetings yet.">{recentMeetings.map((meeting) => <Link key={meeting.id} href={`/workspaces/${workspaceId}/meetings/${meeting.id}`} className="group block rounded-lg px-3 py-3 transition hover:bg-[var(--hover)]"><p className="truncate text-sm font-medium">{meeting.title}</p><p className="mt-1 text-xs text-[var(--muted)]">{meeting.updatedAt?.toLocaleString() || "New meeting"}</p></Link>)}</DashboardList><DashboardList title="Recent documents" href={`/workspaces/${workspaceId}/documents`} action="View all" empty="No documents yet.">{documents.map((document) => <Link key={document.id} href={`/workspaces/${workspaceId}/documents/${document.id}`} className="group block rounded-lg px-3 py-3 transition hover:bg-[var(--hover)]"><p className="truncate text-sm font-medium">{document.title}</p><p className="mt-1 text-xs text-[var(--muted)]">{document.updatedAt?.toLocaleString() || "New document"}</p></Link>)}</DashboardList><DashboardList title="Recent activity" href={`/workspaces/${workspaceId}/activity`} action="Open activity" empty="No recorded activity yet.">{activity.slice(0, 5).map((event) => <div key={event.id} className="flex items-start gap-3 rounded-lg px-3 py-3"><span className="mt-1 text-[var(--subtle)]">◦</span><div className="min-w-0"><p className="text-sm">{event.description}</p><p className="mt-1 text-xs text-[var(--muted)]">{event.createdAt?.toLocaleString() || "Just now"}</p></div></div>)}</DashboardList></div></div></section></main>;
}

function Metric({ label, value, href }: { label: string; value: number; href: string }) {
  return <Link href={href} className="bg-[var(--surface)] px-5 py-5 transition hover:bg-[var(--hover)]"><p className="proveit-label">{label}</p><p className="mt-2 text-3xl font-semibold tracking-[-0.045em]">{value}</p></Link>;
}

function DashboardList({ title, href, action, empty, className = "", children }: { title: string; href: string; action: string; empty: string; className?: string; children: React.ReactNode }) {
  const hasChildren = Array.isArray(children) && children.length > 0;
  return <section className={className}><div className="flex items-center justify-between border-b border-[var(--border)] pb-3"><h2 className="proveit-section-title">{title}</h2><Link href={href} className="text-sm text-[var(--muted)] transition hover:text-[var(--foreground)]">{action} →</Link></div><div className="pt-1">{hasChildren ? children : <p className="py-7 text-sm text-[var(--muted)]">{empty}</p>}</div></section>;
}
