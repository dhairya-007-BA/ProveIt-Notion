"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { useAuth } from "@/components/auth-provider";
import { authenticatedRequest } from "@/lib/authenticated-request";
import { syncWorkspaceTaskToKaneo } from "@/lib/kaneo-business-task-sync";
import type { TaskPriority, TaskStatus } from "@/types/task";
import type { ProveItUser } from "@/types/user";

type ActionItem = {
  id: string;
  title: string;
  details: string;
  suggestedAssignee: string;
  suggestedDueDate: string;
};

type Draft = {
  selected: boolean;
  title: string;
  description: string;
  assigneeId: string;
  dueDate: string;
  priority: TaskPriority;
  status: TaskStatus;
};

type Execution = { proposalId: string; taskId: string; approvedBy: string; title: string; description: string; priority: TaskPriority; needsKaneoSync: boolean };
type CreatedTask = Execution & { created: boolean };

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function strings(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())) : [];
}

function actionItems(value: unknown): ActionItem[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.flatMap((item) => {
    const data = record(item);
    const id = typeof data?.id === "string" ? data.id.trim() : "";
    const title = typeof data?.title === "string" ? data.title.trim() : "";
    if (!id || !title || seen.has(id)) return [];
    seen.add(id);
    return [{
      id,
      title,
      details: typeof data?.details === "string" ? data.details : "",
      suggestedAssignee: typeof data?.suggestedAssignee === "string" ? data.suggestedAssignee : "",
      suggestedDueDate: typeof data?.suggestedDueDate === "string" ? data.suggestedDueDate : "",
    }];
  });
}

function dateSuggestion(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : "";
}

function defaultAssignee(suggestion: string, users: ProveItUser[]) {
  const normalized = suggestion.trim().toLocaleLowerCase();
  if (!normalized) return "";
  return users.find((user) => user.uid === suggestion || user.name.trim().toLocaleLowerCase() === normalized)?.uid || "";
}

function initialDraft(item: ActionItem, users: ProveItUser[]): Draft {
  return {
    selected: true,
    title: item.title,
    description: item.details,
    assigneeId: defaultAssignee(item.suggestedAssignee, users),
    dueDate: dateSuggestion(item.suggestedDueDate),
    priority: "medium",
    status: "todo",
  };
}

export function MeetingExecutionPanel({ workspaceId, meetingId, users }: { workspaceId: string; meetingId: string; users: ProveItUser[] }) {
  const { firebaseUser } = useAuth();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [analysisStatus, setAnalysisStatus] = useState("not_started");
  const [transcriptionStatus, setTranscriptionStatus] = useState("not_started");
  const [rawTranscript, setRawTranscript] = useState("");
  const [analysisAvailable, setAnalysisAvailable] = useState(false);
  const [analysisAvailability, setAnalysisAvailability] = useState("");
  const [transcriptionAvailable, setTranscriptionAvailable] = useState(false);
  const [transcriptionAvailability, setTranscriptionAvailability] = useState("");
  const [audio, setAudio] = useState<File | null>(null);
  const [processing, setProcessing] = useState<"analysis" | "transcription" | null>(null);
  const [summary, setSummary] = useState("");
  const [decisions, setDecisions] = useState<string[]>([]);
  const [risks, setRisks] = useState<string[]>([]);
  const [items, setItems] = useState<ActionItem[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [executions, setExecutions] = useState<Record<string, string>>({});
  const [executionDetails, setExecutionDetails] = useState<Record<string, Execution>>({});
  const [syncingTaskId, setSyncingTaskId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [notificationWarnings, setNotificationWarnings] = useState(0);

  const load = useCallback(async () => {
    if (!firebaseUser) return;
    setLoading(true);
    setError("");
    try {
      const base = `/api/workspaces/${encodeURIComponent(workspaceId)}/meetings/${encodeURIComponent(meetingId)}`;
      const [intelligenceResponse, executionResponse] = await Promise.all([
        authenticatedRequest(firebaseUser, `${base}/intelligence`),
        authenticatedRequest(firebaseUser, `${base}/execute`),
      ]);
      const intelligenceBody = await intelligenceResponse.json().catch(() => null) as unknown;
      const executionBody = await executionResponse.json().catch(() => null) as unknown;
      if (!intelligenceResponse.ok) throw new Error(record(intelligenceBody)?.message as string || "Meeting intelligence could not be loaded.");
      if (!executionResponse.ok) throw new Error(record(executionBody)?.message as string || "Task execution history could not be loaded.");
      const intelligence = record(record(intelligenceBody)?.intelligence);
      const availability = record(record(intelligenceBody)?.availability);
      const analysisCapability = record(availability?.analysis);
      const transcriptionCapability = record(availability?.transcription);
      const analysis = record(intelligence?.analysis);
      const transcription = record(intelligence?.transcription);
      const output = record(analysis?.output);
      const nextItems = actionItems(output?.actionItems);
      const executionEntries = Array.isArray(record(executionBody)?.executions)
        ? (record(executionBody)!.executions as unknown[]).flatMap((value) => {
            const item = record(value);
            return typeof item?.proposalId === "string" && typeof item.taskId === "string" ? [item as unknown as Execution] : [];
          }) : [];
      const nextExecutions = Object.fromEntries(executionEntries.map((entry) => [entry.proposalId, entry.taskId]));
      setAnalysisStatus(typeof analysis?.status === "string" ? analysis.status : "not_started");
      setTranscriptionStatus(typeof transcription?.status === "string" ? transcription.status : "not_started");
      setRawTranscript(typeof intelligence?.rawTranscript === "string" ? intelligence.rawTranscript : "");
      setAnalysisAvailable(analysisCapability?.available === true);
      setAnalysisAvailability(typeof analysisCapability?.message === "string" ? analysisCapability.message : "Analysis availability is unknown.");
      setTranscriptionAvailable(transcriptionCapability?.available === true);
      setTranscriptionAvailability(typeof transcriptionCapability?.message === "string" ? transcriptionCapability.message : "Transcription availability is unknown.");
      setSummary(typeof output?.summary === "string" ? output.summary : "");
      setDecisions(strings(output?.decisions));
      setRisks(strings(output?.risks));
      setItems(nextItems);
      setExecutions(nextExecutions);
      setExecutionDetails(Object.fromEntries(executionEntries.map((entry) => [entry.proposalId, entry])));
      setNotificationWarnings(typeof record(executionBody)?.notificationWarnings === "number" ? record(executionBody)!.notificationWarnings as number : 0);
      setDrafts((current) => Object.fromEntries(nextItems.map((item) => [
        item.id,
        current[item.id] ?? { ...initialDraft(item, users), selected: !nextExecutions[item.id] },
      ])));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Meeting intelligence could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [firebaseUser, meetingId, users, workspaceId]);

  useEffect(() => {
    const timeout = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timeout);
  }, [load]);

  const selected = useMemo(() => items.filter((item) => drafts[item.id]?.selected && !executions[item.id]), [drafts, executions, items]);
  const update = (id: string, fields: Partial<Draft>) => setDrafts((current) => ({ ...current, [id]: { ...current[id], ...fields } }));

  async function retryKaneo(task: Execution) {
    if (!firebaseUser || syncingTaskId || task.approvedBy !== firebaseUser.uid) return;
    setSyncingTaskId(task.taskId);
    setError("");
    try {
      const result = await syncWorkspaceTaskToKaneo(firebaseUser, workspaceId, { proveItTaskId: task.taskId, title: task.title, description: task.description, priority: task.priority });
      if (result === "synced" || result === "not_applicable") {
        setExecutionDetails((current) => ({ ...current, [task.proposalId]: { ...current[task.proposalId], needsKaneoSync: false } }));
        setNotice(result === "synced" ? "External task synchronization completed." : "This workspace does not require external synchronization.");
      } else {
        setError(result === "ambiguous" ? "External synchronization could not be confirmed. Use the controlled reconciliation workflow; it was not retried." : "External synchronization failed and was recorded for review.");
      }
    } finally {
      setSyncingTaskId(null);
    }
  }

  async function runIntelligence(operation: "analysis" | "transcription") {
    if (!firebaseUser || processing) return;
      if (operation === "transcription" && rawTranscript) { setError("The preserved raw transcript cannot be replaced."); return; }
      if (operation === "transcription" && !audio) { setError("Choose an audio file before starting transcription."); return; }
    setProcessing(operation);
    setError("");
    setNotice("");
    try {
      const body = operation === "transcription" ? new FormData() : undefined;
      if (body && audio) body.set("audio", audio);
      const response = await authenticatedRequest(firebaseUser, `/api/workspaces/${encodeURIComponent(workspaceId)}/meetings/${encodeURIComponent(meetingId)}/intelligence/${operation}`, {
        method: "POST",
        ...(body ? { body } : { headers: { "Content-Type": "application/json" }, body: "{}" }),
      });
      const responseBody = await response.json().catch(() => null) as unknown;
      if (!response.ok) throw new Error(record(responseBody)?.message as string || `Meeting ${operation} could not be completed.`);
      setNotice(operation === "transcription" ? "Raw transcript generated. Review it below, then run analysis when ready." : "Meeting analysis completed. Review every proposal before creating tasks.");
      if (operation === "transcription") setAudio(null);
      await load();
    } catch (processError) {
      setError(processError instanceof Error ? processError.message : `Meeting ${operation} could not be completed.`);
      await load();
    } finally {
      setProcessing(null);
    }
  }

  async function approve() {
    if (!firebaseUser || submitting || selected.length === 0) return;
    const invalid = selected.find((item) => !drafts[item.id]?.title.trim());
    if (invalid) { setError("Every selected proposal needs a task title."); return; }
    setSubmitting(true);
    setError("");
    setNotice("");
    try {
      const response = await authenticatedRequest(firebaseUser, `/api/workspaces/${encodeURIComponent(workspaceId)}/meetings/${encodeURIComponent(meetingId)}/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: selected.map((item) => ({ proposalId: item.id, ...drafts[item.id], assigneeId: drafts[item.id].assigneeId || null, dueDate: drafts[item.id].dueDate || null })) }),
      });
      const body = await response.json().catch(() => null) as unknown;
      if (!response.ok) throw new Error(record(body)?.message as string || "Tasks could not be created.");
      const created = Array.isArray(record(body)?.results) ? (record(body)!.results as CreatedTask[]) : [];
      const nextExecutions = Object.fromEntries(created.map((task) => [task.proposalId, task.taskId]));
      setExecutions((current) => ({ ...current, ...nextExecutions }));
      setExecutionDetails((current) => ({ ...current, ...Object.fromEntries(created.map((task) => [task.proposalId, task])) }));
      setDrafts((current) => ({ ...current, ...Object.fromEntries(created.map((task) => [task.proposalId, { ...current[task.proposalId], selected: false }])) }));

      const syncTasks = created.filter((task) => task.needsKaneoSync);
      const syncResults = await Promise.all(syncTasks.map((task) => syncWorkspaceTaskToKaneo(firebaseUser, workspaceId, {
        proveItTaskId: task.taskId,
        title: task.title,
        description: task.description,
        priority: task.priority,
      })));
      const syncedProposalIds = new Set(syncTasks.flatMap((task, index) => syncResults[index] === "synced" || syncResults[index] === "not_applicable" ? [task.proposalId] : []));
      if (syncedProposalIds.size) setExecutionDetails((current) => Object.fromEntries(Object.entries(current).map(([proposalId, detail]) => [proposalId, syncedProposalIds.has(proposalId) ? { ...detail, needsKaneoSync: false } : detail])));
      const syncWarnings = syncResults.filter((result) => result === "failed" || result === "ambiguous").length;
      const notificationWarnings = typeof record(body)?.notificationWarnings === "number" ? record(body)!.notificationWarnings as number : 0;
      setNotificationWarnings(notificationWarnings);
      const createdCount = created.filter((task) => task.created).length;
      const duplicateCount = created.length - createdCount;
      setNotice(`${createdCount} task${createdCount === 1 ? "" : "s"} created${duplicateCount ? `; ${duplicateCount} already existed` : ""}.${syncWarnings ? ` ${syncWarnings} external sync operation${syncWarnings === 1 ? "" : "s"} require attention.` : ""}${notificationWarnings ? ` ${notificationWarnings} assignment notification${notificationWarnings === 1 ? "" : "s"} could not be delivered.` : ""}`);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Tasks could not be created.");
    } finally {
      setSubmitting(false);
    }
  }

  return <section className="mt-8 rounded-2xl border border-[var(--border)] bg-[var(--surface-muted)] p-4 shadow-[var(--shadow-sm)] sm:p-6" aria-labelledby="meeting-intelligence-title">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><p className="proveit-label">Human-reviewed AI</p><h2 id="meeting-intelligence-title" className="proveit-section-title mt-1">Meeting intelligence</h2><p className="mt-1 max-w-2xl text-sm text-[var(--muted)]">AI output stays separate from your notes. Review and edit every proposal before creating company work.</p></div>
      <button type="button" onClick={() => void load()} disabled={loading || submitting} className="proveit-secondary-button w-full disabled:opacity-50 sm:w-auto">{loading ? "Loading…" : "Refresh intelligence"}</button>
    </div>
    {error && <p role="alert" className="mt-4 rounded-lg border border-[var(--danger)]/30 bg-[var(--status-danger-bg)] px-3 py-2 text-sm text-[var(--danger)]">{error}</p>}
    {notice && <p role="status" className="mt-4 rounded-lg border border-[var(--success)]/30 bg-[var(--status-success-bg)] px-3 py-2 text-sm text-[var(--success)]">{notice}</p>}
    {notificationWarnings > 0 && <p role="status" className="mt-4 rounded-lg border border-[var(--warning)]/30 bg-[var(--status-warning-bg)] px-3 py-2 text-sm text-[var(--warning)]">{notificationWarnings} meeting notification{notificationWarnings === 1 ? " remains" : "s remain"} pending. Use Refresh intelligence to retry safe idempotent delivery.</p>}
    {loading && <div role="status" className="mt-5 flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 text-sm text-[var(--muted)]"><span aria-hidden="true" className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--border)] border-t-[var(--secondary)]" />Loading meeting intelligence…</div>}
    {!loading && <div className="mt-5 grid gap-4 lg:grid-cols-2">
      <article className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div className="flex items-start gap-3"><span aria-hidden="true" className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[var(--selected)] text-xs font-semibold text-[var(--secondary)]">1</span><div><h3 className="text-sm font-semibold">Raw transcription</h3><p className="mt-1 text-xs capitalize text-[var(--muted)]">{transcriptionStatus.replaceAll("_", " ")}</p></div></div><span className={`rounded-full px-2 py-1 text-xs font-medium ${transcriptionAvailable ? "bg-[var(--status-success-bg)] text-[var(--success)]" : "bg-[var(--status-warning-bg)] text-[var(--warning)]"}`}>{transcriptionAvailable ? "Available" : "Unavailable"}</span></div><p className="mt-4 text-xs leading-5 text-[var(--muted)]">{rawTranscript ? "A preserved raw transcript already exists and cannot be replaced. This protects the original meeting record." : transcriptionAvailability}</p><label className="mt-4 block text-sm font-medium">Meeting audio<input aria-label="Meeting audio for transcription" type="file" accept="audio/*,video/webm" disabled={!transcriptionAvailable || Boolean(processing) || Boolean(rawTranscript)} onChange={(event) => setAudio(event.target.files?.[0] || null)} className="proveit-control mt-1.5 block w-full px-3 py-2 text-sm" /></label><button type="button" onClick={() => void runIntelligence("transcription")} disabled={!transcriptionAvailable || !audio || Boolean(processing) || Boolean(rawTranscript)} className="proveit-secondary-button mt-4 w-full disabled:opacity-50 sm:w-auto">{rawTranscript ? "Raw transcript preserved" : processing === "transcription" ? "Transcribing…" : transcriptionStatus === "failed" ? "Retry transcription" : "Generate raw transcript"}</button></article>
      <article className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div className="flex items-start gap-3"><span aria-hidden="true" className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[var(--selected)] text-xs font-semibold text-[var(--secondary)]">2</span><div><h3 className="text-sm font-semibold">Structured analysis</h3><p className="mt-1 text-xs capitalize text-[var(--muted)]">{analysisStatus.replaceAll("_", " ")}</p></div></div><span className={`rounded-full px-2 py-1 text-xs font-medium ${analysisAvailable ? "bg-[var(--status-success-bg)] text-[var(--success)]" : "bg-[var(--status-warning-bg)] text-[var(--warning)]"}`}>{analysisAvailable ? "Available" : "Unavailable"}</span></div><p className="mt-4 text-xs leading-5 text-[var(--muted)]">{analysisAvailability}</p><p className="mt-4 text-sm leading-6 text-[var(--muted)]">Analysis uses the preserved raw transcript when available, otherwise the saved human-editable transcript above.</p><button type="button" onClick={() => void runIntelligence("analysis")} disabled={!analysisAvailable || Boolean(processing)} className="proveit-primary-button mt-4 w-full disabled:opacity-50 sm:w-auto">{processing === "analysis" ? "Analyzing…" : analysisStatus === "completed" ? "Run analysis again" : analysisStatus === "failed" ? "Retry analysis" : "Analyze transcript"}</button></article>
    </div>}
    {!loading && rawTranscript && <details className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4"><summary className="cursor-pointer text-sm font-semibold">Preserved raw transcript</summary><p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-[var(--muted)]">{rawTranscript}</p><p className="mt-3 text-xs text-[var(--muted)]">Read-only AI source. It is never overwritten by generated notes or human edits.</p></details>}
    {!loading && analysisStatus !== "completed" && !error && <div className="mt-5 rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] p-5"><p className="font-medium">Analysis is {analysisStatus.replaceAll("_", " ")}.</p><p className="mt-1 text-sm text-[var(--muted)]">Complete transcript analysis before reviewing execution proposals.</p></div>}
    {!loading && analysisStatus === "completed" && <div className="mt-5 space-y-6">
      <div className="grid gap-4 lg:grid-cols-3">
        <article className="rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] p-4 lg:col-span-3"><h3 className="text-sm font-semibold">Summary</h3><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[var(--muted)]">{summary || "No summary was generated."}</p></article>
        <article className="rounded-xl border border-[var(--border)] p-4"><h3 className="text-sm font-semibold">Decisions</h3>{decisions.length ? <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-[var(--muted)]">{decisions.map((decision, index) => <li key={`${index}-${decision}`}>{decision}</li>)}</ul> : <p className="mt-2 text-sm text-[var(--muted)]">No decisions identified.</p>}</article>
        <article className="rounded-xl border border-[var(--border)] p-4"><h3 className="text-sm font-semibold">Risks</h3>{risks.length ? <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-[var(--muted)]">{risks.map((risk, index) => <li key={`${index}-${risk}`}>{risk}</li>)}</ul> : <p className="mt-2 text-sm text-[var(--muted)]">No risks identified.</p>}</article>
        <article className="rounded-xl border border-[var(--border)] p-4"><h3 className="text-sm font-semibold">Action items</h3><p className="mt-2 text-2xl font-semibold">{items.length}</p><p className="mt-1 text-sm text-[var(--muted)]">{Object.keys(executions).length} already converted to tasks</p></article>
      </div>
      <fieldset disabled={submitting} className="space-y-4"><legend className="proveit-section-title mb-3">Review task proposals</legend>{items.map((item, index) => {
        const draft = drafts[item.id] ?? initialDraft(item, users);
        const taskId = executions[item.id];
        const execution = executionDetails[item.id];
        return <article key={item.id} className={`rounded-xl border p-4 shadow-[var(--shadow-sm)] sm:p-5 ${taskId ? "border-[var(--success)]/35 bg-[var(--status-success-bg)]/40" : "border-[var(--border)] bg-[var(--surface)]"}`}>
          <div className="flex items-start gap-3"><input aria-label={`Select proposal ${index + 1}`} type="checkbox" checked={Boolean(draft.selected && !taskId)} disabled={Boolean(taskId)} onChange={(event) => update(item.id, { selected: event.target.checked })} className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--secondary)]" /><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">Proposal {index + 1}</h3>{taskId && <Link href={`/workspaces/${workspaceId}/tasks?task=${encodeURIComponent(taskId)}`} className="text-sm font-medium text-[var(--secondary)] hover:underline">Open created task ↗</Link>}</div>{item.suggestedAssignee && <p className="mt-1 text-xs text-[var(--muted)]">Suggested owner: {item.suggestedAssignee}</p>}{item.suggestedDueDate && <p className="mt-1 text-xs text-[var(--muted)]">Suggested deadline: {item.suggestedDueDate}</p>}{taskId && execution?.needsKaneoSync && (workspaceId === "business" || workspaceId === "technology") && <div className="mt-3 rounded-lg border border-[var(--warning)]/30 bg-[var(--status-warning-bg)] p-3"><p className="text-xs text-[var(--warning)]">This task has no external synchronization attempt yet.</p>{execution.approvedBy === firebaseUser?.uid ? <button type="button" onClick={() => void retryKaneo(execution)} disabled={Boolean(syncingTaskId)} className="proveit-secondary-button mt-2 text-xs disabled:opacity-50">{syncingTaskId === taskId ? "Synchronizing…" : "Synchronize external task"}</button> : <p className="mt-2 text-xs text-[var(--muted)]">The original approver must start synchronization so task ownership remains authorized.</p>}</div>}</div></div>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <label className="text-sm font-medium md:col-span-2">Task title<input aria-label={`Task title for proposal ${index + 1}`} maxLength={200} value={draft.title} onChange={(event) => update(item.id, { title: event.target.value })} disabled={Boolean(taskId)} className="proveit-control mt-1.5 w-full px-3 py-2" /></label>
            <label className="text-sm font-medium md:col-span-2">Description<textarea aria-label={`Task description for proposal ${index + 1}`} maxLength={5000} value={draft.description} onChange={(event) => update(item.id, { description: event.target.value })} disabled={Boolean(taskId)} className="proveit-control mt-1.5 min-h-24 w-full resize-y px-3 py-2" /></label>
            <label className="text-sm font-medium">Assignee<select aria-label={`Task assignee for proposal ${index + 1}`} value={draft.assigneeId} onChange={(event) => update(item.id, { assigneeId: event.target.value })} disabled={Boolean(taskId)} className="proveit-control mt-1.5 w-full px-3 py-2"><option value="">Unassigned</option>{users.map((user) => <option key={user.uid} value={user.uid}>{user.name}</option>)}</select></label>
            <label className="text-sm font-medium">Due date<input aria-label={`Task due date for proposal ${index + 1}`} type="date" value={draft.dueDate} onChange={(event) => update(item.id, { dueDate: event.target.value })} disabled={Boolean(taskId)} className="proveit-control mt-1.5 w-full px-3 py-2" /></label>
            <label className="text-sm font-medium">Priority<select aria-label={`Task priority for proposal ${index + 1}`} value={draft.priority} onChange={(event) => update(item.id, { priority: event.target.value as TaskPriority })} disabled={Boolean(taskId)} className="proveit-control mt-1.5 w-full px-3 py-2"><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="urgent">Urgent</option></select></label>
            <label className="text-sm font-medium">Initial status<select aria-label={`Task status for proposal ${index + 1}`} value={draft.status} onChange={(event) => update(item.id, { status: event.target.value as TaskStatus })} disabled={Boolean(taskId)} className="proveit-control mt-1.5 w-full px-3 py-2"><option value="todo">To do</option><option value="in_progress">In progress</option><option value="blocked">Blocked</option><option value="done">Done</option></select></label>
          </div>
        </article>;
      })}{items.length === 0 && <p className="rounded-xl border border-[var(--border)] p-5 text-sm text-[var(--muted)]">No action-item proposals were generated.</p>}</fieldset>
      {items.length > 0 && <div className="flex flex-col items-start justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] p-4 sm:flex-row sm:items-center"><p className="text-sm text-[var(--muted)]">{selected.length} proposal{selected.length === 1 ? "" : "s"} selected. Approval creates real tasks and cannot be undone from this screen.</p><button type="button" onClick={() => void approve()} disabled={submitting || selected.length === 0} className="proveit-primary-button shrink-0 disabled:cursor-not-allowed disabled:opacity-50">{submitting ? "Creating tasks…" : `Approve ${selected.length || "selected"} task${selected.length === 1 ? "" : "s"}`}</button></div>}
    </div>}
  </section>;
}
