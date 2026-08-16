import "server-only";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";
import { kaneoDelete, kaneoPut, KaneoError } from "@/lib/kaneo";
import { getKaneoProjectIdForWorkspace, type KaneoProjectKey } from "@/lib/kaneo-routing";

const statusMap: Record<string, string | undefined> = { todo: "to-do", in_progress: "in-progress", done: "done", blocked: undefined };
const allowed = new Set(["title", "description", "priority", "status"]);
export type SyncState = "synced" | "failed" | "ambiguous" | "partial";

export async function syncMappedWorkspaceTask(taskId: string, workspaceId: KaneoProjectKey, fields: unknown, projects: { business: string; technology: string }) {
  if (!Array.isArray(fields) || fields.some((field) => typeof field !== "string" || !allowed.has(field))) throw new Error("Invalid sync fields.");
  const ref = adminDb.collection("tasks").doc(taskId); const snapshot = await ref.get(); const task = snapshot.data();
  if (!snapshot.exists || task?.workspaceId !== workspaceId || !task.integration?.kaneo?.taskId) return { state: "partial" as SyncState, message: "External sync is not configured for this task." };
  if (task.integration.kaneo.projectId !== getKaneoProjectIdForWorkspace(workspaceId, projects)) throw new Error("Workspace routing is unavailable.");
  let state: SyncState = "synced";
  try {
    for (const field of fields) {
      if (field === "status" && task.status === "blocked") { state = "partial"; continue; }
      const path = field === "title" ? `/api/task/title/${encodeURIComponent(task.integration.kaneo.taskId)}` : field === "description" ? `/api/task/description/${encodeURIComponent(task.integration.kaneo.taskId)}` : field === "priority" ? `/api/task/priority/${encodeURIComponent(task.integration.kaneo.taskId)}` : `/api/task/status/${encodeURIComponent(task.integration.kaneo.taskId)}`;
      const value = field === "status" ? statusMap[task.status] : task[field];
      if (value === undefined) continue;
      await kaneoPut(path, { [field]: value });
    }
  } catch (error) { state = error instanceof KaneoError && (error.category === "network" || error.category === "timeout") ? "ambiguous" : "failed"; }
  await ref.update({ "integration.kaneo.syncState": state, "integration.kaneo.lastSyncAt": FieldValue.serverTimestamp() });
  return { state, message: state === "synced" ? "External sync updated." : state === "partial" ? "Status is not synced for blocked tasks." : state === "ambiguous" ? "External sync could not be confirmed." : "External sync failed." };
}

export async function deleteMappedWorkspaceTask(taskId: string, workspaceId: KaneoProjectKey, projects: { business: string; technology: string }) {
  const ref = adminDb.collection("tasks").doc(taskId); const snapshot = await ref.get(); const task = snapshot.data();
  if (!snapshot.exists || task?.workspaceId !== workspaceId || !task.integration?.kaneo?.taskId) return { state: "partial" as SyncState };
  if (task.integration.kaneo.projectId !== getKaneoProjectIdForWorkspace(workspaceId, projects)) throw new Error("Workspace routing is unavailable.");
  await kaneoDelete(`/api/task/${encodeURIComponent(task.integration.kaneo.taskId)}`);
  return { state: "synced" as SyncState };
}

/** Locked Business aliases retained for existing callers and regression coverage. */
export function syncMappedBusinessTask(taskId: string, fields: unknown, projects: { business: string; technology: string }) { return syncMappedWorkspaceTask(taskId, "business", fields, projects); }
export function deleteMappedBusinessTask(taskId: string, projects: { business: string; technology: string }) { return deleteMappedWorkspaceTask(taskId, "business", projects); }
