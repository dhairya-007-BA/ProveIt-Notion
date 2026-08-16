import type { User } from "firebase/auth";

import { authenticatedRequest } from "@/lib/authenticated-request";

const BUSINESS_WORKSPACE_ID = "business";
const SUPPORTED_PRIORITIES = new Set(["low", "medium", "high", "urgent"]);
const AMBIGUOUS_MESSAGE =
  "Kaneo task creation outcome is ambiguous and will not be retried automatically.";

export type KaneoBusinessSyncInput = {
  title: string;
  description: string;
  priority: string | undefined;
};

export type KaneoBusinessSyncResult = "not_applicable" | "synced" | "failed" | "ambiguous";

type SyncDependencies = {
  request: typeof authenticatedRequest;
};

const defaultDependencies: SyncDependencies = {
  request: authenticatedRequest,
};

export function createTaskSubmissionGuard() {
  let locked = false;

  return {
    tryAcquire() {
      if (locked) return false;
      locked = true;
      return true;
    },
    release() {
      locked = false;
    },
  };
}

function isAmbiguousResponse(body: unknown) {
  return typeof body === "object" && body !== null && !Array.isArray(body) &&
    (body as { message?: unknown }).message === AMBIGUOUS_MESSAGE;
}

export async function syncBusinessTaskToKaneo(
  user: Pick<User, "getIdToken">,
  workspaceId: string,
  input: KaneoBusinessSyncInput & { proveItTaskId?: string },
  dependencies: Partial<SyncDependencies> = {}
): Promise<KaneoBusinessSyncResult> {
  if (workspaceId !== BUSINESS_WORKSPACE_ID) return "not_applicable";

  const request = dependencies.request ?? defaultDependencies.request;
  const payload = {
    ...(input.proveItTaskId ? { proveItTaskId: input.proveItTaskId } : {}),
    title: input.title,
    description: input.description,
    ...(input.priority && SUPPORTED_PRIORITIES.has(input.priority)
      ? { priority: input.priority }
      : {}),
  };

  try {
    const response = await request(user, "/api/integrations/kaneo/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (response.ok) return "synced";

    const body = await response.json().catch(() => null);
    return isAmbiguousResponse(body) ? "ambiguous" : "failed";
  } catch {
    return "ambiguous";
  }
}

export async function createProveItTaskThenSyncBusinessKaneo(
  createProveItTask: () => Promise<string>,
  user: Pick<User, "getIdToken">,
  workspaceId: string,
  input: KaneoBusinessSyncInput,
  dependencies: Partial<SyncDependencies> = {}
) {
  const proveItTaskId = await createProveItTask();
  const kaneoSync = await syncBusinessTaskToKaneo(
    user,
    workspaceId,
    { ...input, proveItTaskId },
    dependencies
  );

  return { proveItTaskId, kaneoSync };
}
