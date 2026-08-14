"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { collection, doc, onSnapshot, query, serverTimestamp, updateDoc, where } from "firebase/firestore";
import { useParams, useRouter, useSearchParams } from "next/navigation";

import Sidebar from "@/components/sidebar";
import NewTaskForm from "@/components/tasks/new-task-form";
import EditTaskForm, { EditableTask, EditableTaskStatus } from "@/components/tasks/edit-task-form";
import { useAuth } from "@/components/auth-provider";
import { db } from "@/lib/firebase";

const columns: { status: EditableTaskStatus; label: string }[] = [
  { status: "todo", label: "Not started" },
  { status: "in_progress", label: "In progress" },
  { status: "blocked", label: "Blocked" },
  { status: "done", label: "Done" },
];

export default function TasksPage() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { firebaseUser, profile, loading: authLoading } = useAuth();
  const [tasks, setTasks] = useState<EditableTask[]>([]);
  const [view, setView] = useState<"table" | "board">("table");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const selected = tasks.find((task) => task.id === searchParams.get("task")) ?? null;

  useEffect(() => {
    if (!authLoading && !firebaseUser) router.replace("/login");
  }, [authLoading, firebaseUser, router]);

  useEffect(() => {
    if (!firebaseUser || !profile || !workspaceId) return;
    return onSnapshot(query(collection(db, "tasks"), where("workspaceId", "==", workspaceId)), (snapshot) => {
      setTasks(snapshot.docs.map((item) => {
        const value = item.data();
        return {
          id: item.id,
          title: value.title || "Untitled task",
          description: value.description || "",
          workspaceId: value.workspaceId,
          status: value.status || "todo",
          priority: value.priority || "medium",
          assigneeId: value.assigneeId || null,
          dueDate: value.dueDate?.toDate(),
          createdBy: value.createdBy || "",
          createdAt: value.createdAt?.toDate(),
          updatedAt: value.updatedAt?.toDate(),
        } as EditableTask;
      }).filter((_, index) => snapshot.docs[index].data().archived !== true));
    }, (listenerError) => {
      console.error("Failed to listen for tasks:", listenerError);
      setError("Tasks could not be loaded.");
    });
  }, [firebaseUser, profile, workspaceId]);

  async function moveTask(taskId: string, status: EditableTaskStatus) {
    const previous = tasks.find((task) => task.id === taskId);
    if (!previous || previous.status === status) return;
    setError("");
    setTasks((current) => current.map((task) => task.id === taskId ? { ...task, status } : task));
    try {
      await updateDoc(doc(db, "tasks", taskId), { status, updatedAt: serverTimestamp() });
    } catch (moveError) {
      console.error("Failed to move task:", moveError);
      setTasks((current) => current.map((task) => task.id === taskId ? previous : task));
      setError("Task status could not be saved. The change was reverted.");
    }
  }

  function openTask(task: EditableTask) {
    router.push(`/workspaces/${workspaceId}/tasks?task=${task.id}`);
  }

  function closeTask() {
    router.push(`/workspaces/${workspaceId}/tasks`);
  }

  if (authLoading || (!profile && firebaseUser)) return <main className="grid min-h-screen place-items-center text-sm text-[var(--muted)]">Loading tasks…</main>;
  if (!firebaseUser || !profile) return null;

  return <main className="flex min-h-screen bg-[var(--background)]"><Sidebar /><section className="proveit-content"><div className={`mx-auto ${selected ? "max-w-none" : "max-w-[1400px]"}`}><Link href={`/workspaces/${workspaceId}`} className="proveit-back-link px-1">← Back to workspace</Link><header className="proveit-page-header"><div><p className="proveit-label">Tasks</p><h1 className="proveit-page-title mt-1">Tasks</h1></div><button onClick={() => setCreating(true)} className="proveit-primary-button">New task</button></header><div className="mt-8 flex border-b border-[var(--border)]"><ViewButton active={view === "table"} onClick={() => setView("table")}>▦ Table</ViewButton><ViewButton active={view === "board"} onClick={() => setView("board")}>▤ Board</ViewButton></div>{error && <p role="alert" className="mt-3 text-sm text-[var(--danger)]">{error}</p>}<div className={selected ? "grid min-w-0 grid-cols-1 min-[1351px]:grid-cols-[minmax(0,1fr)_minmax(400px,38%)]" : ""}><div className="min-w-0">{view === "table" ? <TaskTable tasks={tasks} onOpen={openTask} onStatus={moveTask} /> : <TaskBoard tasks={tasks} draggedId={draggedId} setDraggedId={setDraggedId} onDrop={moveTask} onOpen={openTask} />}</div>{selected && <aside aria-label="Task detail pane" className="proveit-side-pane min-h-[calc(100vh-10rem)] border-l border-[var(--border)] px-5 py-4 min-[1351px]:sticky min-[1351px]:top-0"><div className="sticky top-0 z-10 flex justify-between bg-[var(--surface)] pb-3"><button aria-label="Close task pane" onClick={closeTask} className="proveit-secondary-button">× Close</button><Link aria-label="Expand task" href={`/workspaces/${workspaceId}/tasks/${selected.id}`} className="proveit-secondary-button">↗ Expand</Link></div><div className="max-h-[calc(100vh-13rem)] overflow-y-auto pr-1"><EditTaskForm task={selected} onCancel={closeTask} onSaved={() => {}} onDeleted={closeTask} /></div></aside>}</div></div></section>{creating && <div role="dialog" aria-modal="true" aria-label="New task" className="fixed inset-0 z-50 grid place-items-start overflow-y-auto bg-black/20 px-4 py-8 sm:place-items-center"><div className="w-full max-w-2xl"><NewTaskForm workspaceId={workspaceId} currentUser={firebaseUser} onCancel={() => setCreating(false)} onCreated={() => setCreating(false)} /></div></div>}</main>;
}

function ViewButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button onClick={onClick} className={`border-b-2 px-3 py-2 text-sm transition ${active ? "border-[var(--foreground)] font-medium" : "border-transparent text-[var(--muted)] hover:text-[var(--foreground)]"}`}>{children}</button>;
}

function TaskTable({ tasks, onOpen, onStatus }: { tasks: EditableTask[]; onOpen: (task: EditableTask) => void; onStatus: (id: string, status: EditableTaskStatus) => void }) {
  return <div className="proveit-list mt-5 overflow-x-auto"><table className="w-full min-w-[640px] text-sm"><thead className="border-b border-[var(--border)] bg-[#fafaf9] text-left text-xs font-medium text-[var(--muted)]"><tr><th className="px-4 py-3">Task</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Priority</th><th className="px-4 py-3">Due date</th></tr></thead><tbody>{tasks.map((task) => <tr key={task.id} className="border-b border-black/[0.07] transition last:border-b-0 hover:bg-[var(--hover)]"><td><button className="w-full px-4 py-3.5 text-left font-medium" onClick={() => onOpen(task)}>{task.title}</button></td><td className="px-4 py-2"><select aria-label={`Status for ${task.title}`} value={task.status} onChange={(event) => onStatus(task.id, event.target.value as EditableTaskStatus)} className="rounded-md bg-transparent px-2 py-1 capitalize hover:bg-white"><option value="todo">Not started</option><option value="in_progress">In progress</option><option value="blocked">Blocked</option><option value="done">Done</option></select></td><td className="px-4 py-2"><span className={`proveit-priority proveit-priority-${task.priority}`}>{task.priority}</span></td><td className="px-4 py-2 text-[var(--muted)]">{task.dueDate?.toLocaleDateString() || "—"}</td></tr>)}</tbody></table>{tasks.length === 0 && <p className="px-4 py-10 text-sm text-[var(--muted)]">No tasks yet. Create the first task for this workspace.</p>}</div>;
}

function TaskBoard({ tasks, draggedId, setDraggedId, onDrop, onOpen }: { tasks: EditableTask[]; draggedId: string | null; setDraggedId: (id: string | null) => void; onDrop: (id: string, status: EditableTaskStatus) => void; onOpen: (task: EditableTask) => void }) {
  return <div className="mt-5 flex gap-4 overflow-x-auto pb-4">{columns.map((column) => { const columnTasks = tasks.filter((task) => task.status === column.status); return <section aria-label={`${column.label} column`} key={column.status} onDragOver={(event) => event.preventDefault()} onDrop={() => { if (draggedId) onDrop(draggedId, column.status); setDraggedId(null); }} className="w-72 shrink-0 rounded-lg bg-[#f1f1ef] p-2"><header className="flex items-center justify-between px-1 py-2 text-sm font-medium"><span>{column.label}</span><span className="text-xs text-[var(--muted)]">{columnTasks.length}</span></header><div className="min-h-32 space-y-2">{columnTasks.map((task) => <button key={task.id} draggable onDragStart={() => setDraggedId(task.id)} onClick={() => onOpen(task)} className="block w-full rounded-md border border-black/[0.08] bg-white p-3 text-left shadow-[0_1px_1px_rgba(15,15,15,0.04)] transition hover:border-black/[0.16] hover:shadow-sm"><p className="text-sm font-medium">{task.title}</p><div className="mt-3 flex items-center justify-between gap-2"><span className={`proveit-priority proveit-priority-${task.priority}`}>{task.priority}</span>{task.dueDate && <span className="text-xs text-[var(--muted)]">{task.dueDate.toLocaleDateString()}</span>}</div></button>)}</div></section>; })}</div>;
}
