import "server-only";

import { FieldValue } from "firebase-admin/firestore";

import { adminDb } from "@/lib/firebase-admin";
import { getKaneoTasks, type KaneoConfig } from "@/lib/kaneo";
import { kaneoCreationFingerprint, KaneoTaskMappingError } from "@/lib/kaneo-task-mapping";
import type { KaneoProjectKey } from "@/lib/kaneo-routing";


export class KaneoTaskReconciliationError extends Error {
  constructor(message: string, readonly status: 404 | 409 | 503) {
    super(message);
    this.name = "KaneoTaskReconciliationError";
  }
}

type AmbiguousMapping = {
  projectId: string;
  creationFingerprint: string;
};

function ambiguousMappingFromTask(snapshot: FirebaseFirestore.DocumentSnapshot, workspaceId: KaneoProjectKey): AmbiguousMapping {
  const task = snapshot.data();
  const mapping = task?.integration?.kaneo;
  if (!snapshot.exists || !task || task.workspaceId !== workspaceId) {
    throw new KaneoTaskReconciliationError("Workspace task not found.", 404);
  }
  if (mapping?.syncState !== "ambiguous" || mapping.taskId ||
    typeof mapping.projectId !== "string" || typeof mapping.creationFingerprint !== "string") {
    throw new KaneoTaskReconciliationError("This task has no ambiguous Kaneo create outcome.", 409);
  }
  return { projectId: mapping.projectId, creationFingerprint: mapping.creationFingerprint };
}

async function readAmbiguousMapping(proveItTaskId: string, workspaceId: KaneoProjectKey) {
  const taskRef = adminDb.collection("tasks").doc(proveItTaskId);
  const snapshot = await taskRef.get();
  return { taskRef, mapping: ambiguousMappingFromTask(snapshot, workspaceId) };
}

export type KaneoReconciliationInspection = {
  projectId: string;
  matchingTaskIds: string[];
};

/**
 * Reads only the fixed Business project. A candidate must match the exact
 * server-recorded creation fingerprint; no user-controlled task attributes
 * are accepted by this reconciliation path.
 */
export async function inspectAmbiguousKaneoTask(
  proveItTaskId: string,
  workspaceId: KaneoProjectKey,
  config: KaneoConfig
): Promise<KaneoReconciliationInspection> {
  const { mapping } = await readAmbiguousMapping(proveItTaskId, workspaceId);
  if (mapping.projectId !== config.projects[workspaceId]) {
    throw new KaneoTaskReconciliationError("Workspace routing is unavailable.", 409);
  }

  const tasks = await getKaneoTasks(mapping.projectId, { config });
  const matchingTaskIds = tasks
    .filter((task) => kaneoCreationFingerprint({
      title: task.title,
      description: task.description ?? undefined,
      priority: task.priority === "low" || task.priority === "medium" ||
        task.priority === "high" || task.priority === "urgent"
        ? task.priority
        : undefined,
    }) === mapping.creationFingerprint)
    .map((task) => task.id);

  return { projectId: mapping.projectId, matchingTaskIds };
}

export async function attachUniqueReconciledKaneoTask(
  proveItTaskId: string,
  workspaceId: KaneoProjectKey,
  projectId: string,
  kaneoTaskId: string
) {
  const taskRef = adminDb.collection("tasks").doc(proveItTaskId);
  await adminDb.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(taskRef);
    const mapping = ambiguousMappingFromTask(snapshot, workspaceId);
    if (mapping.projectId !== projectId) {
      throw new KaneoTaskReconciliationError("Workspace routing is unavailable.", 409);
    }
    transaction.update(taskRef, {
      "integration.kaneo.taskId": kaneoTaskId,
      "integration.kaneo.syncState": "synced",
      "integration.kaneo.reconciledAt": FieldValue.serverTimestamp(),
      "integration.kaneo.syncedAt": FieldValue.serverTimestamp(),
      "integration.kaneo.lastSyncAt": FieldValue.serverTimestamp(),
    });
  });
}

/** Explicit BOD authorization is required before this state can be consumed by one later manual create. */
export async function permitKaneoTaskRetryAfterNoMatch(
  proveItTaskId: string,
  workspaceId: KaneoProjectKey,
  projectId: string
) {
  const taskRef = adminDb.collection("tasks").doc(proveItTaskId);
  await adminDb.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(taskRef);
    const mapping = ambiguousMappingFromTask(snapshot, workspaceId);
    if (mapping.projectId !== projectId) {
      throw new KaneoTaskReconciliationError("Workspace routing is unavailable.", 409);
    }
    transaction.update(taskRef, {
      "integration.kaneo.syncState": "retry_permitted",
      "integration.kaneo.reconciledAt": FieldValue.serverTimestamp(),
      "integration.kaneo.lastSyncAt": FieldValue.serverTimestamp(),
    });
  });
}

export function reconciliationErrorResponse(error: unknown) {
  if (error instanceof KaneoTaskReconciliationError || error instanceof KaneoTaskMappingError) {
    return { status: error.status, message: error.message };
  }
  return { status: 503 as const, message: "Kaneo reconciliation is unavailable." };
}
