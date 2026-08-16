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

type Task = EditableTask;

export default function TaskDetailPage() {
  const { workspaceId, taskId } = useParams<{ workspaceId: string; taskId: string }>();
  const router = useRouter();
  const { firebaseUser, profile, loading: authLoading } = useAuth();
  const [task, setTask] = useState<Task | null>(null);
  const [error, setError] = useState("");

  useEffect(() => { if (!authLoading && !firebaseUser) router.replace("/login"); }, [authLoading, firebaseUser, router]);
  useEffect(() => { if (!firebaseUser || !profile) return; return onSnapshot(doc(db, "tasks", taskId), (snapshot) => { const data = snapshot.data(); if (!data || data.workspaceId !== workspaceId) { setError("Task could not be found."); return; } setTask({ id: snapshot.id, title: data.title || "Untitled task", description: data.description || "", status: data.status || "todo", priority: data.priority || "medium", workspaceId: data.workspaceId, assigneeId: data.assigneeId || null, createdBy: data.createdBy || "", createdAt: data.createdAt?.toDate(), dueDate: data.dueDate?.toDate(), updatedAt: data.updatedAt?.toDate(), customFields: data.customFields as Record<string, CustomFieldValue> | undefined, integration: data.integration }); }, () => setError("Task could not be found.")); }, [firebaseUser, profile, taskId, workspaceId]);

  if (authLoading || (!task && !error)) return <main className="grid min-h-screen place-items-center text-sm text-[#787774]">Loading task…</main>;
  if (!firebaseUser || !profile || !task) return <main className="grid min-h-screen place-items-center text-sm text-red-700">{error}</main>;

  return <RecordDetailShell backHref={`/workspaces/${workspaceId}/tasks`} backLabel="Tasks">
    {error && <p role="alert" className="mt-4 text-sm text-red-700">{error}</p>}
    <EditTaskForm task={task} onCancel={() => router.push(`/workspaces/${workspaceId}/tasks`)} onSaved={() => {}} onDeleted={() => router.push(`/workspaces/${workspaceId}/tasks`)} />
    <Comments workspaceId={workspaceId} entityType="task" entityId={taskId} />
  </RecordDetailShell>;
}
