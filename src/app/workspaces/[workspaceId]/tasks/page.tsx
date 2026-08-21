"use client";

import Link from "next/link";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { collection, doc, onSnapshot, query, serverTimestamp, updateDoc, where } from "firebase/firestore";
import { useParams, useRouter, useSearchParams } from "next/navigation";

import Sidebar from "@/components/sidebar";
import NewTaskForm from "@/components/tasks/new-task-form";
import EditTaskForm, { type EditableTask, type EditableTaskStatus } from "@/components/tasks/edit-task-form";
import { Comments } from "@/components/comments";
import { AssigneeName } from "@/components/tasks/assignee-name";
import { useAuth } from "@/components/auth-provider";
import { syncWorkspaceTaskUpdate } from "@/lib/kaneo-business-task-update-sync";
import { db } from "@/lib/firebase";
import { getUsers } from "@/lib/users";
import { type CustomFieldValue, type WorkspaceCustomField } from "@/lib/custom-fields";
import { compareCustomPropertyValues, matchesCustomPropertyFilter, type CustomPropertyFilter } from "@/lib/task-property-view";
import { TASK_PRIORITY_META, TASK_STATUS_META, TaskPriorityBadge, TaskStatusBadge } from "@/components/ui/task-metadata";

const columns: { status: EditableTaskStatus; label: string }[] = [{ status: "todo", label: "To do" }, { status: "in_progress", label: "In progress" }, { status: "blocked", label: "Blocked" }, { status: "done", label: "Done" }];
const priorities = ["urgent", "high", "medium", "low"] as const;
type Sort = "updated" | "created" | "due" | "priority" | "title";
type Direction = "asc" | "desc";
type Preferences = { assignee: boolean; priority: boolean; due: boolean; description: boolean; custom: boolean; customFieldIds: string[] };
const defaultPreferences: Preferences = { assignee: true, priority: true, due: true, description: false, custom: false, customFieldIds: [] };
type SavedView = { view?: "board" | "list"; preferences?: Partial<Preferences> };

function dateFilterMatch(task: EditableTask, value: string) {
  if (value === "all") return true;
  if (value === "none") return !task.dueDate;
  if (!task.dueDate) return false;
  const now = new Date(); now.setHours(0, 0, 0, 0);
  const due = new Date(task.dueDate); due.setHours(0, 0, 0, 0);
  if (value === "overdue") return due < now;
  return due.getTime() === now.getTime();
}

export default function TasksPage() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { firebaseUser, profile, loading } = useAuth();
  const [tasks, setTasks] = useState<EditableTask[]>([]);
  const [view, setView] = useState<"board" | "list">("board");
  const [preferences, setPreferences] = useState<Preferences>(defaultPreferences);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | EditableTaskStatus>("all");
  const [priority, setPriority] = useState<"all" | EditableTask["priority"]>("all");
  const [assignee, setAssignee] = useState<"all" | "unassigned" | string>("all");
  const [due, setDue] = useState("all");
  const [sort, setSort] = useState<Sort>("updated");
  const [direction, setDirection] = useState<Direction>("desc");
  const [customFilter, setCustomFilter] = useState<CustomPropertyFilter | null>(null);
  const [customSortId, setCustomSortId] = useState<string>("");
  const [filterOpen, setFilterOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const [creatingStatus, setCreatingStatus] = useState<EditableTaskStatus | null>(null);
  const [dragged, setDragged] = useState<string | null>(null);
  const [syncNotice, setSyncNotice] = useState("");
  const [error, setError] = useState("");
  const [employeeOptions, setEmployeeOptions] = useState<{ uid: string; name: string }[]>([]);
  const [customFields, setCustomFields] = useState<WorkspaceCustomField[]>([]);
  const selected = tasks.find((task) => task.id === searchParams.get("task")) ?? null;

  useEffect(() => { if (!loading && !firebaseUser) router.replace("/login"); }, [firebaseUser, loading, router]);
  useEffect(() => {
    if (!workspaceId) return;
    const timer = window.setTimeout(() => {
      const stored = localStorage.getItem(`proveit:tasks:view:${workspaceId}`);
      if (!stored) return;
      try {
        const value = JSON.parse(stored) as SavedView;
        if (value.view === "board" || value.view === "list") setView(value.view);
        if (value.preferences) setPreferences({ ...defaultPreferences, ...value.preferences });
      } catch { /* Ignore an invalid local preference. */ }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [workspaceId]);
  useEffect(() => { if (workspaceId) localStorage.setItem(`proveit:tasks:view:${workspaceId}`, JSON.stringify({ view, preferences })); }, [preferences, view, workspaceId]);
  useEffect(() => { void getUsers().then((users) => setEmployeeOptions(users.filter((user) => user.active).map((user) => ({ uid: user.uid, name: user.name })).sort((a, b) => a.name.localeCompare(b.name)))).catch(() => setEmployeeOptions([])); }, []);
  useEffect(() => { if (!workspaceId) return; return onSnapshot(query(collection(db, "workspaceCustomFields"), where("workspaceId", "==", workspaceId)), (snapshot) => setCustomFields(snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as WorkspaceCustomField)).filter((field) => field.active !== false).sort((a, b) => a.position - b.position)), () => setCustomFields([])); }, [workspaceId]);
  useEffect(() => {
    if (!firebaseUser || !profile || !workspaceId) return;
    return onSnapshot(query(collection(db, "tasks"), where("workspaceId", "==", workspaceId)), (snapshot) => {
      setTasks(snapshot.docs.filter((item) => item.data().archived !== true).map((item) => {
        const value = item.data();
        return { id: item.id, title: value.title || "Untitled task", description: value.description || "", workspaceId: value.workspaceId, status: value.status || "todo", priority: value.priority || "medium", assigneeId: value.assigneeId || null, dueDate: value.dueDate?.toDate(), createdBy: value.createdBy || "", createdAt: value.createdAt?.toDate(), updatedAt: value.updatedAt?.toDate(), customFields: value.customFields, integration: value.integration };
      }) as EditableTask[]);
    }, () => setError("Tasks could not be loaded. Please try again."));
  }, [firebaseUser, profile, workspaceId]);

  const visible = useMemo(() => {
    const multiplier = direction === "asc" ? 1 : -1;
    return tasks.filter((task) => (status === "all" || task.status === status) && (priority === "all" || task.priority === priority) && (assignee === "all" || (assignee === "unassigned" ? !task.assigneeId : task.assigneeId === assignee)) && dateFilterMatch(task, due) && (!customFilter || (() => { const field = customFields.find((item) => item.id === customFilter.fieldId); return !field || matchesCustomPropertyFilter(task.customFields?.[field.id], field, customFilter); })()) && (!search.trim() || `${task.title} ${task.description}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()))).sort((a, b) => {
      if (customSortId) { const field = customFields.find((item) => item.id === customSortId); if (field) return compareCustomPropertyValues(a.customFields?.[field.id], b.customFields?.[field.id], field, (uid) => employeeOptions.find((person) => person.uid === uid)?.name || "") * multiplier; }
      const value = sort === "title" ? a.title.localeCompare(b.title) : sort === "priority" ? priorities.indexOf(a.priority) - priorities.indexOf(b.priority) : sort === "due" ? (a.dueDate?.getTime() ?? Number.MAX_SAFE_INTEGER) - (b.dueDate?.getTime() ?? Number.MAX_SAFE_INTEGER) : (a[sort === "created" ? "createdAt" : "updatedAt"]?.getTime() ?? 0) - (b[sort === "created" ? "createdAt" : "updatedAt"]?.getTime() ?? 0);
      return value * multiplier;
    });
  }, [assignee, customFields, customFilter, customSortId, direction, due, employeeOptions, priority, search, sort, status, tasks]);

  async function moveTask(taskId: string, next: EditableTaskStatus) {
    const previous = tasks.find((task) => task.id === taskId);
    if (!previous || previous.status === next) return;
    setTasks((current) => current.map((task) => task.id === taskId ? { ...task, status: next } : task));
    try {
      await updateDoc(doc(db, "tasks", taskId), { status: next, updatedAt: serverTimestamp() });
      const result = firebaseUser ? await syncWorkspaceTaskUpdate(firebaseUser, workspaceId, taskId, ["status"]) : null;
      if (result && result.state !== "synced") setSyncNotice(result.message || "Task moved, but Kaneo synchronization was not confirmed.");
    } catch {
      setTasks((current) => current.map((task) => task.id === taskId ? previous : task));
      setError("Task status could not be saved.");
    }
  }
  const startCreate = (taskStatus: EditableTaskStatus = "todo") => setCreatingStatus(taskStatus);
  const clear = () => { setStatus("all"); setPriority("all"); setAssignee("all"); setDue("all"); setSearch(""); setCustomFilter(null); };
  const activeFilters = [status !== "all" && ["Status", TASK_STATUS_META[status].label, () => setStatus("all")] as const, priority !== "all" && ["Priority", TASK_PRIORITY_META[priority].label, () => setPriority("all")] as const, assignee !== "all" && ["Assignee", assignee === "unassigned" ? "Unassigned" : employeeOptions.find((item) => item.uid === assignee)?.name || "Assigned", () => setAssignee("all")] as const, due !== "all" && ["Due", due === "none" ? "No due date" : due, () => setDue("all")] as const].filter(Boolean) as [string, string, () => void][];

  if (loading || (!profile && firebaseUser)) return <main className="grid min-h-screen place-items-center text-sm text-[var(--muted)]">Loading tasks…</main>;
  if (!firebaseUser || !profile) return null;

  return <main className="flex min-h-screen bg-[var(--background)]"><Sidebar /><section className="min-w-0 flex-1 px-4 py-6 sm:px-7 lg:px-10"><div className="mx-auto max-w-[1560px]">
    <Link href={`/workspaces/${workspaceId}`} className="proveit-back-link inline-flex px-1">Workspace overview</Link>
    <header className="mt-4 flex items-end justify-between gap-4"><div><p className="proveit-label">{workspaceId} workspace</p><h1 className="proveit-heading mt-1 text-3xl font-semibold">Tasks</h1></div><button type="button" onClick={() => startCreate()} className="proveit-primary-button">+ New task</button></header>
    <div className="mt-6 flex flex-col gap-3 border-y border-[var(--border)] py-3 lg:flex-row lg:items-center">
      <div className="flex rounded-lg border border-[var(--border)] bg-[var(--surface)] p-1"><Tab active={view === "board"} onClick={() => setView("board")}>Board</Tab><Tab active={view === "list"} onClick={() => setView("list")}>List</Tab></div>
      <label className="relative min-w-0 flex-1"><span className="sr-only">Search tasks</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search tasks…" className="proveit-control w-full py-2 pl-3 pr-9" />{search && <button type="button" aria-label="Clear search" onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--muted)]">×</button>}</label>
      <div className="flex flex-wrap gap-2 overflow-visible">
        <MenuButton open={filterOpen} setOpen={setFilterOpen} label="Filter"><label className="block text-sm">Status<select value={status} onChange={(event) => setStatus(event.target.value as typeof status)} className="proveit-control mt-1 w-full p-2"><option value="all">All</option>{columns.map((item) => <option key={item.status} value={item.status}>{item.label}</option>)}</select></label><label className="mt-3 block text-sm">Priority<select value={priority} onChange={(event) => setPriority(event.target.value as typeof priority)} className="proveit-control mt-1 w-full p-2"><option value="all">All</option>{priorities.map((item) => <option key={item} value={item}>{item}</option>)}</select></label><label className="mt-3 block text-sm">Assignee<select value={assignee} onChange={(event) => setAssignee(event.target.value)} className="proveit-control mt-1 w-full p-2"><option value="all">All assignees</option><option value="unassigned">Unassigned</option>{employeeOptions.map((employee) => <option key={employee.uid} value={employee.uid}>{employee.name}</option>)}</select></label><label className="mt-3 block text-sm">Due date<select value={due} onChange={(event) => setDue(event.target.value)} className="proveit-control mt-1 w-full p-2"><option value="all">Any date</option><option value="overdue">Overdue</option><option value="today">Due today</option><option value="none">No due date</option></select></label><button type="button" onClick={clear} className="mt-3 text-sm text-[var(--secondary)]">Clear all</button></MenuButton>
        <MenuButton open={sortOpen} setOpen={setSortOpen} label="Sort">{(["updated", "created", "due", "priority", "title"] as Sort[]).map((item) => <button type="button" key={item} onClick={() => { setSort(item); }} className={`block w-full rounded-md px-2 py-2 text-left text-sm hover:bg-[var(--hover)] ${sort === item ? "font-medium text-[var(--secondary)]" : ""}`}>{item === "updated" ? "Updated" : item === "created" ? "Created" : item === "due" ? "Due date" : item[0].toUpperCase() + item.slice(1)}</button>)}<div className="mt-2 border-t border-[var(--border)] pt-2"><button type="button" onClick={() => setDirection("asc")} className={`block w-full rounded-md px-2 py-2 text-left text-sm hover:bg-[var(--hover)] ${direction === "asc" ? "font-medium text-[var(--secondary)]" : ""}`}>Ascending</button><button type="button" onClick={() => setDirection("desc")} className={`block w-full rounded-md px-2 py-2 text-left text-sm hover:bg-[var(--hover)] ${direction === "desc" ? "font-medium text-[var(--secondary)]" : ""}`}>Descending</button></div></MenuButton>
        {view === "board" && <span className="inline-flex min-h-10 items-center rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] px-3 text-sm font-medium text-[var(--muted)]" aria-label="Tasks are grouped by status">Group: Status</span>}
        <MenuButton open={customizeOpen} setOpen={setCustomizeOpen} label="Customize"><p className="proveit-label px-2 py-1">Card fields</p>{(["assignee", "priority", "due", "description"] as const).map((key) => <label key={key} className="flex gap-2 px-2 py-2 text-sm capitalize"><input type="checkbox" checked={preferences[key]} onChange={(event) => setPreferences((current) => ({ ...current, [key]: event.target.checked }))} />{key === "due" ? "Due date" : key}</label>)}<p className="proveit-label mt-2 border-t border-[var(--border)] px-2 py-2">Custom properties</p>{customFields.map((field) => <label key={field.id} className="flex gap-2 px-2 py-2 text-sm"><input type="checkbox" checked={preferences.customFieldIds.includes(field.id)} onChange={(event) => setPreferences((current) => ({ ...current, customFieldIds: event.target.checked ? [...current.customFieldIds, field.id] : current.customFieldIds.filter((id) => id !== field.id) }))} />{field.name}</label>)}<Link href={`/workspaces/${workspaceId}/settings/custom-fields`} className="mt-2 block rounded-md border-t border-[var(--border)] px-2 py-2 text-sm font-medium text-[var(--secondary)] hover:bg-[var(--hover)]">Manage properties</Link></MenuButton>
      </div>
    </div>
    {customFields.length > 0 && <div className="mt-3 flex flex-wrap items-end gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] p-2"><label className="text-xs text-[var(--muted)]">Custom filter<select value={customFilter?.fieldId || ""} onChange={(event) => { const field = customFields.find((item) => item.id === event.target.value); setCustomFilter(field ? { fieldId: field.id, operator: field.type === "checkbox" ? "checked" : "contains", value: "" } : null); }} className="proveit-control ml-1 px-2 py-1 text-sm"><option value="">None</option>{customFields.map((field) => <option key={field.id} value={field.id}>{field.name}</option>)}</select></label>{customFilter && (() => { const field = customFields.find((item) => item.id === customFilter.fieldId); if (!field) return null; const options = field.type === "number" ? ["equals", "not_equals", "greater_than", "greater_than_or_equal", "less_than", "less_than_or_equal", "is_empty", "is_not_empty"] : field.type === "date" ? ["is", "before", "after", "is_empty", "is_not_empty"] : field.type === "checkbox" ? ["checked", "unchecked"] : field.type === "single_select" || field.type === "person" ? ["is", "is_not", "is_empty", "is_not_empty"] : field.type === "multi_select" ? ["contains", "does_not_contain", "is_empty", "is_not_empty"] : ["contains", "is", "is_not", "is_empty", "is_not_empty"]; const noValue = customFilter.operator.includes("empty") || field.type === "checkbox"; return <><select aria-label="Custom property filter operator" value={customFilter.operator} onChange={(event) => setCustomFilter({ ...customFilter, operator: event.target.value })} className="proveit-control px-2 py-1 text-sm">{options.map((option) => <option key={option}>{option.replaceAll("_", " ")}</option>)}</select>{!noValue && (field.type === "single_select" || field.type === "multi_select" ? <select aria-label="Custom property filter value" value={customFilter.value || ""} onChange={(event) => setCustomFilter({ ...customFilter, value: event.target.value })} className="proveit-control px-2 py-1 text-sm"><option value="">Choose…</option>{field.options.map((option) => <option key={option}>{option}</option>)}</select> : field.type === "person" ? <select aria-label="Custom property filter value" value={customFilter.value || ""} onChange={(event) => setCustomFilter({ ...customFilter, value: event.target.value })} className="proveit-control px-2 py-1 text-sm"><option value="">Choose…</option>{employeeOptions.map((person) => <option key={person.uid} value={person.uid}>{person.name}</option>)}</select> : <input aria-label="Custom property filter value" type={field.type === "number" ? "number" : field.type === "date" ? "date" : "text"} value={customFilter.value || ""} onChange={(event) => setCustomFilter({ ...customFilter, value: event.target.value })} className="proveit-control w-32 px-2 py-1 text-sm" />)}</>; })()}<label className="text-xs text-[var(--muted)]">Custom sort<select value={customSortId} onChange={(event) => setCustomSortId(event.target.value)} className="proveit-control ml-1 px-2 py-1 text-sm"><option value="">Default</option>{customFields.filter((field) => ["text", "number", "date", "single_select", "person"].includes(field.type)).map((field) => <option key={field.id} value={field.id}>{field.name}</option>)}</select></label></div>}
    {(activeFilters.length > 0 || customFilter) && <div className="mt-3 flex flex-wrap gap-2 text-xs">{activeFilters.map(([label, value, remove]) => <span key={label} className="proveit-chip">{label}: {value} <button type="button" onClick={remove} aria-label={`Remove ${label} filter`}>×</button></span>)}{customFilter && <span className="proveit-chip">Custom property <button type="button" onClick={() => setCustomFilter(null)} aria-label="Remove custom property filter">×</button></span>}<button type="button" onClick={clear} className="text-[var(--secondary)]">Clear all</button></div>}
    {error && <p role="alert" className="mt-4 text-sm text-[var(--danger)]">{error}</p>}
    {view === "board" ? <Board tasks={visible} preferences={preferences} customFields={customFields} dragged={dragged} setDragged={setDragged} onMove={moveTask} onOpen={(task) => router.push(`/workspaces/${workspaceId}/tasks?task=${task.id}`)} onCreate={startCreate} /> : <List tasks={visible} preferences={preferences} customFields={customFields} onMove={moveTask} onOpen={(task) => router.push(`/workspaces/${workspaceId}/tasks?task=${task.id}`)} />}
    {visible.length === 0 && <div className="py-12 text-center text-sm text-[var(--muted)]">No tasks match these filters. <button type="button" onClick={clear} className="text-[var(--secondary)]">Clear filters</button></div>}
  </div></section>
  {selected && <Drawer task={selected} workspaceId={workspaceId} onClose={() => router.push(`/workspaces/${workspaceId}/tasks`)} />}
  {creatingStatus && <aside aria-label="New task panel" className="fixed inset-y-0 right-0 z-50 w-full max-w-xl border-l border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-md)]"><NewTaskForm key={creatingStatus} workspaceId={workspaceId} currentUser={firebaseUser} initialStatus={creatingStatus} onCancel={() => setCreatingStatus(null)} onCreated={() => setCreatingStatus(null)} onSyncNotice={setSyncNotice} /></aside>}
  {syncNotice && <p role="status" className="proveit-toast fixed bottom-5 right-5 z-[70] px-4 py-3 text-sm">{syncNotice}</p>}
  </main>;
}

function Tab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) { return <button type="button" aria-pressed={active} onClick={onClick} className={`rounded-md px-3 py-1.5 text-sm ${active ? "bg-[var(--selected)] font-medium" : "text-[var(--muted)] hover:bg-[var(--hover)]"}`}>{children}</button>; }
function MenuButton({ label, open, setOpen, children }: { label: string; open: boolean; setOpen: (value: boolean) => void; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null); const triggerRef = useRef<HTMLButtonElement>(null); const panelId = useId();
  useEffect(() => {
    const dismiss = (event: KeyboardEvent) => { if (event.key === "Escape" && open) { setOpen(false); triggerRef.current?.focus(); } };
    const outside = (event: MouseEvent) => { if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false); };
    window.addEventListener("keydown", dismiss); window.addEventListener("mousedown", outside);
    return () => { window.removeEventListener("keydown", dismiss); window.removeEventListener("mousedown", outside); };
  }, [open, setOpen]);
  useEffect(() => { if (open) window.requestAnimationFrame(() => ref.current?.querySelector<HTMLElement>(`#${CSS.escape(panelId)} input, #${CSS.escape(panelId)} select, #${CSS.escape(panelId)} button, #${CSS.escape(panelId)} a`)?.focus()); }, [open, panelId]);
  return <div ref={ref} className="relative"><button ref={triggerRef} type="button" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen(!open)} className="proveit-secondary-button whitespace-nowrap">{label}</button>{open && <div id={panelId} role="dialog" aria-label={`${label} tasks`} className="absolute right-0 z-30 mt-2 w-56 rounded-xl border border-[var(--border)] bg-[var(--surface-elevated)] p-2 shadow-[var(--shadow-md)]">{children}</div>}</div>;
}
function Sync({ task, workspaceId }: { task: EditableTask; workspaceId: string }) { const state = task.integration?.kaneo?.syncState; if (workspaceId !== "business" || !state) return null; const label = state === "synced" ? "Synced" : state === "partial" ? "Status not synced" : state === "ambiguous" ? "Sync not confirmed" : "Sync failed"; return <span title={label} className={state === "synced" ? "text-[var(--accent)]" : "text-[var(--primary)]"}>◉</span>; }
function CustomValue({ field, value }: { field: WorkspaceCustomField; value: CustomFieldValue | undefined }) { if (value == null || value === "" || (Array.isArray(value) && !value.length)) return <span className="text-[var(--subtle)]">—</span>; if (field.type === "person" && typeof value === "string") return <AssigneeName uid={value} />; if (field.type === "checkbox") return <span>{value === true ? "Checked" : "Unchecked"}</span>; if (field.type === "date" && typeof value === "string") return <span>{new Date(`${value}T12:00:00`).toLocaleDateString()}</span>; if (field.type === "url" && typeof value === "string") return <a href={value} target="_blank" rel="noreferrer" className="truncate text-[var(--secondary)] hover:underline" onClick={(event) => event.stopPropagation()}>Link</a>; return <span className="truncate">{Array.isArray(value) ? value.join(", ") : String(value)}</span>; }
function Card({ task, workspaceId, preferences, customFields = [], onOpen }: { task: EditableTask; workspaceId: string; preferences: Preferences; customFields?: WorkspaceCustomField[]; onOpen: () => void }) { const shown = customFields.filter((field) => preferences.customFieldIds.includes(field.id)).slice(0, 3); const overdue = Boolean(task.dueDate && task.status !== "done" && task.dueDate.getTime() < new Date().setHours(0, 0, 0, 0)); return <button type="button" onClick={onOpen} className="group block w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 text-left shadow-[var(--shadow-sm)] transition hover:-translate-y-px hover:border-[var(--brand-primary,var(--secondary))] hover:shadow-[var(--shadow-md)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]"><p className="line-clamp-2 text-sm font-semibold leading-5">{task.title}</p>{preferences.description && task.description && <p className="mt-1 line-clamp-2 text-xs leading-5 text-[var(--muted)]">{task.description}</p>}<div className="mt-3 flex min-w-0 flex-wrap items-center gap-2 text-xs text-[var(--muted)]">{preferences.priority && <TaskPriorityBadge priority={task.priority} />}{preferences.due && task.dueDate && <span className={`inline-flex items-center gap-1 shrink-0 ${overdue ? "font-semibold text-[var(--danger)]" : ""}`}><span aria-hidden>◷</span>{overdue ? "Overdue · " : ""}{task.dueDate.toLocaleDateString()}</span>}{preferences.assignee && <AssigneeName uid={task.assigneeId} />}<span className="ml-auto"><Sync task={task} workspaceId={workspaceId} /></span></div>{shown.length > 0 && <div className="mt-3 space-y-1 border-t border-[var(--border)] pt-2 text-xs text-[var(--muted)]">{shown.map((field) => <div key={field.id} className="flex gap-2"><span className="truncate">{field.name}</span><CustomValue field={field} value={task.customFields?.[field.id]} /></div>)}</div>}</button>; }
function Board({ tasks, preferences, customFields, dragged, setDragged, onMove, onOpen, onCreate }: { tasks: EditableTask[]; preferences: Preferences; customFields: WorkspaceCustomField[]; dragged: string | null; setDragged: (id: string | null) => void; onMove: (id: string, status: EditableTaskStatus) => void; onOpen: (task: EditableTask) => void; onCreate: (status: EditableTaskStatus) => void }) {
  const [dragOver, setDragOver] = useState<EditableTaskStatus | null>(null);
  const [announcement, setAnnouncement] = useState("");
  function keyboardMove(task: EditableTask, direction: -1 | 1) {
    const current = columns.findIndex((column) => column.status === task.status);
    const next = columns[current + direction];
    if (!next) { setAnnouncement(`${task.title} is already in the ${columns[current].label} column.`); return; }
    onMove(task.id, next.status); setAnnouncement(`${task.title} moved to ${next.label}.`);
  }
  return <><p className="sr-only">On a task card move handle, press Alt plus Left or Right Arrow to change status.</p><p aria-live="polite" className="sr-only">{announcement}</p><div className="mt-5 flex snap-x snap-mandatory gap-3 overflow-x-auto pb-3 sm:grid sm:grid-cols-2 sm:overflow-visible xl:grid-cols-4">{columns.map((column) => { const items = tasks.filter((task) => task.status === column.status); return <section key={column.status} aria-label={`${column.label} column`} onDragEnter={() => setDragOver(column.status)} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragOver(null); }} onDragOver={(event) => event.preventDefault()} onDrop={() => { if (dragged) onMove(dragged, column.status); setDragged(null); setDragOver(null); }} className={`min-h-56 w-[min(86vw,340px)] shrink-0 snap-start rounded-xl border bg-[var(--sidebar)] p-3 transition sm:w-auto ${dragOver === column.status ? "border-[var(--brand-primary,var(--secondary))] ring-2 ring-[var(--focus)]/30" : "border-[var(--border)]"}`}><header className={`flex min-h-9 items-center gap-2 rounded-lg border-l-4 px-2 proveit-task-status-accent-${column.status}`}><h2 className="proveit-heading text-xs font-semibold uppercase tracking-wide">{column.label}</h2><span className="grid h-5 min-w-5 place-items-center rounded-full bg-[var(--surface-elevated)] px-1.5 text-[11px] text-[var(--muted)]">{items.length}</span><button type="button" onClick={() => onCreate(column.status)} aria-label={`Add task to ${column.label}`} className="ml-auto grid h-9 w-9 place-items-center rounded-md text-[var(--secondary)] transition hover:bg-[var(--hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]">+</button></header><div className="mt-3 space-y-2">{items.map((task) => <div key={task.id} draggable tabIndex={0} aria-label={`Move ${task.title}. Current status ${column.label}.`} aria-keyshortcuts="Alt+ArrowLeft Alt+ArrowRight" onKeyDown={(event) => { if (!event.altKey) return; if (event.key === "ArrowLeft") { event.preventDefault(); keyboardMove(task, -1); } if (event.key === "ArrowRight") { event.preventDefault(); keyboardMove(task, 1); } }} onDragStart={() => setDragged(task.id)} onDragEnd={() => { setDragged(null); setDragOver(null); }} className={`cursor-grab rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)] active:cursor-grabbing ${dragged === task.id ? "scale-[0.98] opacity-60" : ""}`}><Card task={task} workspaceId={task.workspaceId} preferences={preferences} customFields={customFields} onOpen={() => onOpen(task)} /></div>)}{items.length === 0 && <button type="button" onClick={() => onCreate(column.status)} className="w-full rounded-lg border border-dashed border-[var(--border)] py-7 text-sm text-[var(--muted)] transition hover:border-[var(--brand-primary,var(--secondary))] hover:bg-[var(--hover)] hover:text-[var(--secondary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]">No tasks yet<br /><span className="text-xs">Add a task</span></button>}</div></section>; })}</div></>;
}
function List({ tasks, preferences, customFields, onOpen, onMove }: { tasks: EditableTask[]; preferences: Preferences; customFields: WorkspaceCustomField[]; onOpen: (task: EditableTask) => void; onMove: (id: string, status: EditableTaskStatus) => void }) { const shown = customFields.filter((field) => preferences.customFieldIds.includes(field.id)); return <div className="mt-5 overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--surface)]" tabIndex={0} aria-label="Task list. Scroll horizontally for more columns on small screens."><table className="w-full min-w-[760px] text-sm"><thead className="border-b border-[var(--border)] text-left text-xs text-[var(--muted)]"><tr><th className="sticky left-0 z-[1] bg-[var(--surface)] px-4 py-3">Task</th><th className="px-4 py-3">Status</th>{preferences.priority && <th className="px-4 py-3">Priority</th>}{preferences.assignee && <th className="px-4 py-3">Assignee</th>}{preferences.due && <th className="px-4 py-3">Due date</th>}{shown.map((field) => <th key={field.id} className="px-4 py-3">{field.name}</th>)}</tr></thead><tbody>{tasks.map((task) => { const overdue = Boolean(task.dueDate && task.status !== "done" && task.dueDate.getTime() < new Date().setHours(0, 0, 0, 0)); return <tr key={task.id} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--hover)]"><td className="sticky left-0 z-[1] bg-[var(--surface)]"><button type="button" onClick={() => onOpen(task)} className="w-full px-4 py-3 text-left font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--focus)]">{task.title}</button></td><td className="px-4"><div className="flex items-center gap-2"><TaskStatusBadge status={task.status} /><select value={task.status} aria-label={`Change status for ${task.title}`} onChange={(event) => onMove(task.id, event.target.value as EditableTaskStatus)} className="proveit-control max-w-9 px-1 text-sm" title="Change status"><option value="todo">To do</option><option value="in_progress">In progress</option><option value="blocked">Blocked</option><option value="done">Done</option></select></div></td>{preferences.priority && <td className="px-4"><TaskPriorityBadge priority={task.priority} /></td>}{preferences.assignee && <td className="px-4"><AssigneeName uid={task.assigneeId} /></td>}{preferences.due && <td className={`px-4 ${overdue ? "font-semibold text-[var(--danger)]" : "text-[var(--muted)]"}`}>{overdue ? "Overdue · " : ""}{task.dueDate?.toLocaleDateString() || "—"}</td>}{shown.map((field) => <td key={field.id} className="max-w-48 px-4"><CustomValue field={field} value={task.customFields?.[field.id]} /></td>)}</tr>; })}</tbody></table></div>; }
function Drawer({ task, workspaceId, onClose }: { task: EditableTask; workspaceId: string; onClose: () => void }) {
  const panelRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    function handleKeyDown(event: KeyboardEvent) {
      if (document.querySelector('[role="dialog"][aria-label="Search ProveIt"]')) return;
      if (event.key === "Escape") { event.preventDefault(); onCloseRef.current(); return; }
      if (event.key !== "Tab" || !panelRef.current) return;
      const focusable = [...panelRef.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')];
      if (!focusable.length) return;
      const first = focusable[0]; const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => { document.removeEventListener("keydown", handleKeyDown); document.body.style.overflow = previousOverflow; previousFocus?.focus(); };
  }, []);

  return <div className="fixed inset-0 z-50 bg-black/35" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><aside ref={panelRef} role="dialog" aria-label="Task detail panel" aria-modal="true" aria-labelledby="task-sheet-title" className="absolute inset-y-0 right-0 flex w-full flex-col bg-[var(--surface)] shadow-[var(--shadow-md)] sm:max-w-[620px] sm:border-l sm:border-[var(--border)]"><header className="sticky top-0 z-10 flex shrink-0 items-start justify-between gap-3 border-b border-[var(--border)] bg-[var(--surface)] px-4 py-4 sm:px-5"><div className="min-w-0 flex-1"><p className="proveit-label">{workspaceId} · Task</p><h2 id="task-sheet-title" className="mt-1 truncate text-base font-semibold">{task.title}</h2></div><div className="flex shrink-0 items-center gap-2"><Link href={`/workspaces/${workspaceId}/tasks/${task.id}`} aria-label="Open task full page" title="Open full page" className="grid h-11 w-11 place-items-center rounded-lg border border-[var(--border)] text-[var(--muted)] transition hover:bg-[var(--hover)] hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]"><svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 fill-none stroke-current stroke-2"><path d="M14 5h5v5M19 5l-8 8M18 13v5a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" strokeLinecap="round" strokeLinejoin="round" /></svg></Link><button ref={closeRef} type="button" onClick={onClose} title="Close task" className="grid h-11 w-11 place-items-center rounded-lg border border-[var(--border)] text-[var(--muted)] transition hover:bg-[var(--hover)] hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]" aria-label="Close task"><svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 fill-none stroke-current stroke-2"><path d="m7 7 10 10M17 7 7 17" strokeLinecap="round" /></svg></button></div></header><div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5 sm:px-5"><EditTaskForm key={task.id} task={task} onCancel={onClose} onSaved={() => {}} onDeleted={onClose} /><Comments workspaceId={workspaceId} entityType="task" entityId={task.id} /></div></aside></div>;
}
