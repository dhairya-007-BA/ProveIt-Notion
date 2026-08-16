import type { User } from "firebase/auth";
import { authenticatedRequest } from "@/lib/authenticated-request";
type Dependencies = { request: typeof authenticatedRequest };
const defaultDependencies: Dependencies = { request: authenticatedRequest };

export async function syncBusinessTaskUpdate(user: Pick<User, "getIdToken">, workspaceId: string, taskId: string, fields: string[], dependencies: Partial<Dependencies> = {}) {
  if (workspaceId !== "business" || fields.length === 0) return null;
  try {
    const response = await (dependencies.request ?? defaultDependencies.request)(user, `/api/integrations/kaneo/tasks/${taskId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fields }) });
    return response.json().catch(() => ({ success: false, state: "ambiguous", message: "External sync could not be confirmed." }));
  } catch {
    return { success: false, state: "ambiguous", message: "External sync could not be confirmed." };
  }
}
export async function syncBusinessTaskDelete(user: Pick<User, "getIdToken">, workspaceId: string, taskId: string, dependencies: Partial<Dependencies> = {}) {
  if (workspaceId !== "business") return true;
  try {
    const response = await (dependencies.request ?? defaultDependencies.request)(user, `/api/integrations/kaneo/tasks/${taskId}`, { method: "DELETE" });
    return response.ok;
  } catch {
    return false;
  }
}
