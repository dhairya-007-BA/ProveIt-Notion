"use client";

import { useEffect, useState } from "react";
import { doc, onSnapshot, serverTimestamp, updateDoc } from "firebase/firestore";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import { Comments } from "@/components/comments";
import { RecordContentSection, RecordDetailShell, RecordProperties, RecordProperty, RecordTitle } from "@/components/record-detail-shell";
import { db } from "@/lib/firebase";

type Task = { title: string; description: string; status: string; priority: string; dueDate?: Date; updatedAt?: Date; workspaceId: string };

export default function TaskDetailPage() {
  const { workspaceId, taskId } = useParams<{ workspaceId: string; taskId: string }>();
  const router = useRouter();
  const { firebaseUser, profile, loading: authLoading } = useAuth();
  const [task, setTask] = useState<Task | null>(null);
  const [error, setError] = useState("");

  useEffect(() => { if (!authLoading && !firebaseUser) router.replace("/login"); }, [authLoading, firebaseUser, router]);
  useEffect(() => { if (!firebaseUser || !profile) return; return onSnapshot(doc(db, "tasks", taskId), (snapshot) => { const data = snapshot.data(); if (!data || data.workspaceId !== workspaceId) { setError("Task could not be found."); return; } setTask({ title: data.title || "Untitled task", description: data.description || "", status: data.status || "todo", priority: data.priority || "medium", workspaceId: data.workspaceId, dueDate: data.dueDate?.toDate(), updatedAt: data.updatedAt?.toDate() }); }, () => setError("Task could not be found.")); }, [firebaseUser, profile, taskId, workspaceId]);
  async function update(values: Partial<Task>) { if (!task) return; const previous = task; setTask({ ...task, ...values }); try { await updateDoc(doc(db, "tasks", taskId), { ...values, updatedAt: serverTimestamp() }); } catch { setTask(previous); setError("Task changes could not be saved."); } }

  if (authLoading || (!task && !error)) return <main className="grid min-h-screen place-items-center text-sm text-[#787774]">Loading task…</main>;
  if (!firebaseUser || !profile || !task) return <main className="grid min-h-screen place-items-center text-sm text-red-700">{error}</main>;

  return <RecordDetailShell backHref={`/workspaces/${workspaceId}/tasks`} backLabel="Tasks">
    {error && <p role="alert" className="mt-4 text-sm text-red-700">{error}</p>}
    <RecordTitle ariaLabel="Task title" value={task.title} onChange={(title) => setTask({ ...task, title })} onBlur={(title) => update({ title: title.trim() || "Untitled task" })} />
    <RecordProperties>
      <RecordProperty label="Status" icon="◉"><select aria-label="Task status" value={task.status} onChange={(event) => update({ status: event.target.value })} className="rounded bg-transparent px-2 py-1 text-sm outline-none hover:bg-[#f1f1ef] focus:bg-[#f1f1ef] focus-visible:ring-2 focus-visible:ring-[#2383e2]/35"><option value="todo">Not started</option><option value="in_progress">In progress</option><option value="blocked">Blocked</option><option value="done">Done</option></select></RecordProperty>
      <RecordProperty label="Priority" icon="⚑"><select aria-label="Task priority" value={task.priority} onChange={(event) => update({ priority: event.target.value })} className="rounded bg-transparent px-2 py-1 text-sm outline-none hover:bg-[#f1f1ef] focus:bg-[#f1f1ef] focus-visible:ring-2 focus-visible:ring-[#2383e2]/35"><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="urgent">Urgent</option></select></RecordProperty>
      <RecordProperty label="Due date" icon="□">{task.dueDate?.toLocaleDateString() || "Empty"}</RecordProperty>
      <RecordProperty label="Last edited" icon="◷">{task.updatedAt?.toLocaleString() || "—"}</RecordProperty>
    </RecordProperties>
    <RecordContentSection title="Details"><textarea aria-label="Task description" value={task.description} onChange={(event) => setTask({ ...task, description: event.target.value })} onBlur={(event) => update({ description: event.target.value })} placeholder="Add a description…" className="min-h-40 w-full resize-y rounded bg-transparent px-1 py-2 text-sm leading-7 outline-none placeholder:text-[#9b9a97] hover:bg-black/[0.02] focus:bg-black/[0.025] focus-visible:ring-2 focus-visible:ring-[#2383e2]/35" /></RecordContentSection>
    <Comments workspaceId={workspaceId} entityType="task" entityId={taskId} />
  </RecordDetailShell>;
}
