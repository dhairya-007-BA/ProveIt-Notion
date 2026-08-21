"use client";

import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import { Comments } from "@/components/comments";
import { RecordDetailShell } from "@/components/record-detail-shell";
import { db } from "@/lib/firebase";
import EditTaskForm, { type EditableTask } from "@/components/tasks/edit-task-form";
import { type CustomFieldValue } from "@/lib/custom-fields";
import { TaskPriorityBadge, TaskStatusBadge } from "@/components/ui/task-metadata";

type Task = EditableTask;

export default function TaskDetailPage() {
  const { workspaceId, taskId } = useParams<{ workspaceId: string; taskId: string }>();
  const router = useRouter();
  const { firebaseUser, profile, loading: authLoading } = useAuth();
  const [task, setTask] = useState<Task | null>(null);
  const [error, setError] = useState("");

  useEffect(() => { if (!authLoading && !firebaseUser) router.replace("/login"); }, [authLoading, firebaseUser, router]);
  useEffect(() => { if (!firebaseUser || !profile) return; return onSnapshot(doc(db, "tasks", taskId), (snapshot) => { const data = snapshot.data(); if (!data || data.workspaceId !== workspaceId) { setError("Task could not be found."); return; } setTask({ id: snapshot.id, title: data.title || "Untitled task", description: data.description || "", status: data.status || "todo", priority: data.priority || "medium", workspaceId: data.workspaceId, assigneeId: data.assigneeId || null, createdBy: data.createdBy || "", createdAt: data.createdAt?.toDate(), dueDate: data.dueDate?.toDate(), updatedAt: data.updatedAt?.toDate(), customFields: data.customFields as Record<string, CustomFieldValue> | undefined, integration: data.integration }); }, () => setError("Task could not be found.")); }, [firebaseUser, profile, taskId, workspaceId]);

  if (authLoading || (!task && !error)) return <main className="grid min-h-screen place-items-center bg-[var(--background)] text-sm text-[var(--muted)]"><span className="proveit-skeleton h-5 w-32" aria-label="Loading task" /></main>;
  if (!firebaseUser || !profile || !task) return <main className="grid min-h-screen place-items-center bg-[var(--background)] px-4 text-sm text-[var(--danger)]"><p role="alert" className="rounded-lg bg-[var(--danger-soft)] px-4 py-3">{error}</p></main>;

  return <RecordDetailShell backHref={`/workspaces/${workspaceId}/tasks`} backLabel="Tasks">
    <header className="mb-6 border-b border-[var(--border)] pb-5"><p className="proveit-label">{workspaceId} · Task</p><div className="mt-2 flex flex-wrap items-center gap-2"><TaskStatusBadge status={task.status} /><TaskPriorityBadge priority={task.priority} />{task.dueDate ? <time className={`text-xs ${task.status !== "done" && task.dueDate < new Date() ? "font-semibold text-[var(--danger)]" : "text-[var(--muted)]"}`}>{task.status !== "done" && task.dueDate < new Date() ? "Overdue · " : "Due · "}{task.dueDate.toLocaleDateString()}</time> : null}</div></header>
    {error && <p role="alert" className="mt-4 rounded-lg bg-[var(--danger-soft)] px-3 py-2 text-sm text-[var(--danger)]">{error}</p>}
    <EditTaskForm task={task} onCancel={() => router.push(`/workspaces/${workspaceId}/tasks`)} onSaved={() => {}} onDeleted={() => router.push(`/workspaces/${workspaceId}/tasks`)} />
    <Comments workspaceId={workspaceId} entityType="task" entityId={taskId} />
  </RecordDetailShell>;
}
