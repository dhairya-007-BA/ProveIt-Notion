import "server-only";

import { createHash } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";

import { adminDb } from "@/lib/firebase-admin";
import type { KaneoProjectKey } from "@/lib/kaneo-routing";

export class KaneoTaskMappingError extends Error {
  constructor(message: string, readonly status: 403 | 404 | 409 | 503) {
    super(message);
    this.name = "KaneoTaskMappingError";
  }
}

type KaneoCreationState = "creating" | "failed" | "ambiguous" | "retry_permitted";

export type KaneoCreationFingerprintInput = {
  title: string;
  description?: string;
  priority?: "low" | "medium" | "high" | "urgent";
};

function normalizedCreationValues(input: KaneoCreationFingerprintInput) {
  return {
    title: input.title.trim(),
    description: input.description?.trim() ?? "",
    priority: input.priority ?? "no-priority",
    status: "to-do",
  };
}

/** A non-reversible correlation value; task content is never copied into the mapping. */
export function kaneoCreationFingerprint(input: KaneoCreationFingerprintInput) {
  return createHash("sha256")
    .update(JSON.stringify(normalizedCreationValues(input)))
    .digest("hex");
}

function taskForWorkspaceMapping(snapshot: FirebaseFirestore.DocumentSnapshot, userId: string, workspaceId: KaneoProjectKey) {
  const task = snapshot.data();
  if (!snapshot.exists || !task) {
    throw new KaneoTaskMappingError("ProveIt task not found.", 404);
  }
  if (task.workspaceId !== workspaceId || task.createdBy !== userId) {
    throw new KaneoTaskMappingError("Workspace task access required.", 403);
  }
  return task;
}

function taskMatchesCreationInput(task: Record<string, unknown>, input: KaneoCreationFingerprintInput) {
  const normalized = normalizedCreationValues(input);
  return typeof task.title === "string" && task.title.trim() === normalized.title &&
    typeof task.description === "string" && task.description.trim() === normalized.description &&
    task.priority === normalized.priority;
}

/**
 * Atomically claims the existing task's own integration field before an
 * upstream create. This is the durable idempotency boundary: a repeated
 * browser or route invocation cannot issue a second Kaneo create for it.
 */
export async function reserveKaneoTaskCreation(
  proveItTaskId: string,
  userId: string,
  workspaceId: KaneoProjectKey,
  projectId: string,
  input: KaneoCreationFingerprintInput,
  allowBodPermittedRetry = false
) {
  const taskRef = adminDb.collection("tasks").doc(proveItTaskId);
  const fingerprint = kaneoCreationFingerprint(input);
  await adminDb.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(taskRef);
    const task = taskForWorkspaceMapping(snapshot, userId, workspaceId);
    if (!taskMatchesCreationInput(task, input)) {
      throw new KaneoTaskMappingError("Kaneo synchronization must match the ProveIt task.", 409);
    }
    const existing = task.integration?.kaneo;
    if (existing?.syncState === "retry_permitted") {
      if (!allowBodPermittedRetry || existing.projectId !== projectId || existing.creationFingerprint !== fingerprint) {
        throw new KaneoTaskMappingError("Kaneo retry authorization does not match this task.", 409);
      }
      transaction.update(taskRef, {
        "integration.kaneo.syncState": "creating",
        "integration.kaneo.creationAttempt": FieldValue.increment(1),
        "integration.kaneo.requestedAt": FieldValue.serverTimestamp(),
      });
      return;
    }
    if (existing?.taskId || existing?.syncState) {
      throw new KaneoTaskMappingError(
        "This ProveIt task already has a Kaneo synchronization attempt.",
        409
      );
    }
    transaction.update(taskRef, {
      "integration.kaneo": {
        projectId,
        syncState: "creating",
        creationFingerprint: fingerprint,
        creationAttempt: 1,
        requestedAt: FieldValue.serverTimestamp(),
      },
    });
  });
}

/** Records a terminal create outcome on the same trusted task mapping. */
export async function markKaneoTaskCreationOutcome(
  proveItTaskId: string,
  userId: string,
  workspaceId: KaneoProjectKey,
  projectId: string,
  syncState: Extract<KaneoCreationState, "failed" | "ambiguous">
) {
  const taskRef = adminDb.collection("tasks").doc(proveItTaskId);
  await adminDb.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(taskRef);
    const task = taskForWorkspaceMapping(snapshot, userId, workspaceId);
    const existing = task.integration?.kaneo;
  if (existing?.taskId || existing?.projectId !== projectId || existing?.syncState !== "creating") {
      throw new KaneoTaskMappingError("Kaneo synchronization state could not be recorded.", 409);
    }
    transaction.update(taskRef, {
      "integration.kaneo.syncState": syncState,
      "integration.kaneo.lastSyncAt": FieldValue.serverTimestamp(),
    });
  });
}

export async function linkKaneoTaskToProveItTask(
  proveItTaskId: string,
  userId: string,
  workspaceId: KaneoProjectKey,
  kaneo: { taskId: string; projectId: string }
) {
  const taskRef = adminDb.collection("tasks").doc(proveItTaskId);
  const snapshot = await taskRef.get();
  const task = taskForWorkspaceMapping(snapshot, userId, workspaceId);
  if (task.integration?.kaneo?.taskId) {
    throw new KaneoTaskMappingError("This ProveIt task is already linked to Kaneo.", 409);
  }

  if (task.integration?.kaneo?.projectId !== kaneo.projectId ||
    typeof task.integration?.kaneo?.creationFingerprint !== "string") {
    throw new KaneoTaskMappingError("Workspace routing is unavailable.", 409);
  }

  await taskRef.update({
    "integration.kaneo": {
      taskId: kaneo.taskId,
      projectId: kaneo.projectId,
      syncState: "synced",
      creationFingerprint: task.integration.kaneo.creationFingerprint,
      creationAttempt: task.integration.kaneo.creationAttempt ?? 1,
      syncedAt: FieldValue.serverTimestamp(),
      lastSyncAt: FieldValue.serverTimestamp(),
    },
  });
}
