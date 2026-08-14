"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { collection, doc, onSnapshot, query, where } from "firebase/firestore";
import { useParams, useRouter } from "next/navigation";

import Sidebar from "@/components/sidebar";
import { useAuth } from "@/components/auth-provider";
import { db } from "@/lib/firebase";

type Task = { id: string; title: string; status: string; priority: string; dueDate?: Date };
type Meeting = { id: string; title: string; updatedAt?: Date };
type Activity = { id: string; description: string; createdAt?: Date };
type WorkspaceSummary = { name: string; icon: string };

const statusLabel = (status: string) => status.replace("_", " ");

export default function DashboardPage() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const router = useRouter();
  const { firebaseUser, profile, loading } = useAuth();
  const [workspace, setWorkspace] = useState<WorkspaceSummary | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
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
        return { id: item.id, title: data.title || "Untitled task", status: data.status || "todo", priority: data.priority || "medium", dueDate: data.dueDate?.toDate() };
      }).filter((_, index) => snapshot.docs[index].data().archived !== true));
    }, (listenerError) => {
      console.error("Failed to load dashboard tasks:", listenerError);
      setError("Tasks could not be loaded for this overview.");
    });
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
    const priority = { urgent: 0, high: 1, medium: 2, low: 3 };
    return priority[left.priority as keyof typeof priority] - priority[right.priority as keyof typeof priority];
  }).slice(0, 6);
  const recentMeetings = [...meetings].sort((left, right) => (right.updatedAt?.getTime() || 0) - (left.updatedAt?.getTime() || 0)).slice(0, 5);

  if (loading) return <main className="grid min-h-screen place-items-center text-sm text-[var(--muted)]">Loading dashboard…</main>;
  if (!firebaseUser || !profile) return null;

  return <main className="flex min-h-screen bg-[var(--background)]"><Sidebar /><section className="min-w-0 flex-1 px-5 py-7 sm:px-8 md:px-10"><div className="mx-auto max-w-6xl"><Link href={`/workspaces/${workspaceId}`} className="text-sm text-[var(--muted)] transition hover:text-[var(--foreground)]">← Back to workspace</Link><header className="mt-7 flex flex-wrap items-end justify-between gap-5"><div className="flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-lg bg-[var(--sidebar)] text-2xl">{workspace?.icon || "📁"}</span><div><p className="proveit-label">{workspace?.name || "Workspace"}</p><h1 className="proveit-page-title">Dashboard</h1></div></div><Link href={`/workspaces/${workspaceId}/tasks`} className="proveit-primary-button">View tasks</Link></header><p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--muted)]">A live overview of the work, priorities, and meetings in this workspace.</p>{error && <p role="alert" className="mt-4 text-sm text-[var(--danger)]">{error}</p>}<section className="mt-8 grid gap-px overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--border)] sm:grid-cols-2 xl:grid-cols-4"><Metric label="All tasks" value={counts.total} href={`/workspaces/${workspaceId}/tasks`} /><Metric label="In progress" value={counts.active} href={`/workspaces/${workspaceId}/tasks`} /><Metric label="Completed" value={counts.completed} href={`/workspaces/${workspaceId}/tasks`} /><Metric label="High priority" value={counts.highPriority} href={`/workspaces/${workspaceId}/tasks`} /></section><div className="mt-8 grid gap-8 lg:grid-cols-2"><DashboardList title="Open tasks" href={`/workspaces/${workspaceId}/tasks`} action="View all" empty="No open tasks in this workspace.">{openTasks.map((task) => <Link key={task.id} href={`/workspaces/${workspaceId}/tasks?task=${task.id}`} className="group flex items-center justify-between gap-4 px-1 py-3 transition hover:bg-[var(--hover)]"><div className="min-w-0"><p className="truncate text-sm font-medium">{task.title}</p><p className="mt-1 text-xs capitalize text-[var(--muted)]">{statusLabel(task.status)} · {task.priority} priority</p></div>{task.dueDate && <time className="shrink-0 text-xs text-[var(--muted)]">{task.dueDate.toLocaleDateString()}</time>}</Link>)}</DashboardList><DashboardList title="Recent meetings" href={`/workspaces/${workspaceId}/meetings`} action="View all" empty="No meetings yet.">{recentMeetings.map((meeting) => <Link key={meeting.id} href={`/workspaces/${workspaceId}/meetings/${meeting.id}`} className="group block px-1 py-3 transition hover:bg-[var(--hover)]"><p className="truncate text-sm font-medium">{meeting.title}</p><p className="mt-1 text-xs text-[var(--muted)]">{meeting.updatedAt?.toLocaleString() || "New meeting"}</p></Link>)}</DashboardList></div><DashboardList title="Recent activity" href={`/workspaces/${workspaceId}/activity`} action="Open activity" empty="No recorded activity yet." className="mt-8">{activity.slice(0, 5).map((event) => <div key={event.id} className="flex items-start gap-3 px-1 py-3"><span className="mt-1 text-[var(--subtle)]">◦</span><div className="min-w-0"><p className="text-sm">{event.description}</p><p className="mt-1 text-xs text-[var(--muted)]">{event.createdAt?.toLocaleString() || "Just now"}</p></div></div>)}</DashboardList></div></section></main>;
}

function Metric({ label, value, href }: { label: string; value: number; href: string }) {
  return <Link href={href} className="bg-white px-5 py-4 transition hover:bg-[var(--hover)]"><p className="proveit-label">{label}</p><p className="mt-2 text-3xl font-semibold tracking-[-0.035em]">{value}</p></Link>;
}

function DashboardList({ title, href, action, empty, className = "", children }: { title: string; href: string; action: string; empty: string; className?: string; children: React.ReactNode }) {
  const hasChildren = Array.isArray(children) && children.length > 0;
  return <section className={className}><div className="flex items-center justify-between border-b border-[var(--border)] pb-2"><h2 className="proveit-section-title">{title}</h2><Link href={href} className="text-sm text-[var(--muted)] transition hover:text-[var(--foreground)]">{action} →</Link></div><div>{hasChildren ? children : <p className="py-7 text-sm text-[var(--muted)]">{empty}</p>}</div></section>;
}
