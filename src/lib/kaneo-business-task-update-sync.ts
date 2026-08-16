import type { User } from "firebase/auth";
import { authenticatedRequest } from "@/lib/authenticated-request";
type Dependencies = { request: typeof authenticatedRequest };
const defaultDependencies: Dependencies = { request: authenticatedRequest };

export async function syncWorkspaceTaskUpdate(user: Pick<User, "getIdToken">, workspaceId: string, taskId: string, fields: string[], dependencies: Partial<Dependencies> = {}) {
  if ((workspaceId !== "business" && workspaceId !== "technology") || fields.length === 0) return null;
  try {
    const endpoint = workspaceId === "business" ? `/api/integrations/kaneo/tasks/${taskId}` : `/api/integrations/kaneo/tasks/${taskId}?workspaceId=${encodeURIComponent(workspaceId)}`;
    const response = await (dependencies.request ?? defaultDependencies.request)(user, endpoint, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fields }) });
    return response.json().catch(() => ({ success: false, state: "ambiguous", message: "External sync could not be confirmed." }));
  } catch {
    return { success: false, state: "ambiguous", message: "External sync could not be confirmed." };
  }
}
export async function syncWorkspaceTaskDelete(user: Pick<User, "getIdToken">, workspaceId: string, taskId: string, dependencies: Partial<Dependencies> = {}) {
  if (workspaceId !== "business" && workspaceId !== "technology") return true;
  try {
    const endpoint = workspaceId === "business" ? `/api/integrations/kaneo/tasks/${taskId}` : `/api/integrations/kaneo/tasks/${taskId}?workspaceId=${encodeURIComponent(workspaceId)}`;
    const response = await (dependencies.request ?? defaultDependencies.request)(user, endpoint, { method: "DELETE" });
    return response.ok;
  } catch {
    return false;
  }
}

export async function syncBusinessTaskUpdate(user: Pick<User, "getIdToken">, workspaceId: string, taskId: string, fields: string[], dependencies: Partial<Dependencies> = {}) {
  return workspaceId === "business" ? syncWorkspaceTaskUpdate(user, workspaceId, taskId, fields, dependencies) : null;
}
export async function syncBusinessTaskDelete(user: Pick<User, "getIdToken">, workspaceId: string, taskId: string, dependencies: Partial<Dependencies> = {}) {
  return workspaceId === "business" ? syncWorkspaceTaskDelete(user, workspaceId, taskId, dependencies) : true;
}
