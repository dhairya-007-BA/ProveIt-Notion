import type { User } from "firebase/auth";

import type { CreateTaskInput } from "@/lib/tasks";

async function authorizedFetch(user: User, input: RequestInfo | URL, init: RequestInit) {
  const token = await user.getIdToken();
  return fetch(input, { ...init, headers: { ...init.headers, Authorization: `Bearer ${token}`, "Content-Type": "application/json" } });
}

export async function createTaskOnServer(user: User, input: Omit<CreateTaskInput, "createdBy">) {
  const response = await authorizedFetch(user, `/api/workspaces/${encodeURIComponent(input.workspaceId)}/tasks`, {
    method: "POST",
    body: JSON.stringify({ ...input, dueDate: input.dueDate?.toISOString() ?? null }),
  });
  const result = await response.json().catch(() => null) as { taskId?: string; message?: string } | null;
  if (!response.ok || !result?.taskId) throw new Error(result?.message || "Task could not be created.");
  return result.taskId;
}

export async function updateTaskAssigneeOnServer(user: User, workspaceId: string, taskId: string, assigneeId: string | null) {
  const response = await authorizedFetch(user, `/api/workspaces/${encodeURIComponent(workspaceId)}/tasks/${encodeURIComponent(taskId)}/assignment`, {
    method: "PATCH",
    body: JSON.stringify({ assigneeId }),
  });
  const result = await response.json().catch(() => null) as { success?: boolean; message?: string; notificationWarning?: boolean } | null;
  if (!response.ok || !result?.success) throw new Error(result?.message || "Task assignment could not be updated.");
  return result;
}
