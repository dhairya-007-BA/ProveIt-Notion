import "server-only";

import { FieldValue } from "firebase-admin/firestore";

import { adminDb } from "@/lib/firebase-admin";

const BUSINESS_WORKSPACE_ID = "business";

export class KaneoTaskMappingError extends Error {
  constructor(message: string, readonly status: 403 | 404 | 409 | 503) {
    super(message);
    this.name = "KaneoTaskMappingError";
  }
}

export async function linkKaneoTaskToProveItTask(
  proveItTaskId: string,
  userId: string,
  kaneo: { taskId: string; projectId: string }
) {
  const taskRef = adminDb.collection("tasks").doc(proveItTaskId);
  const snapshot = await taskRef.get();
  const task = snapshot.data();

  if (!snapshot.exists || !task) {
    throw new KaneoTaskMappingError("ProveIt task not found.", 404);
  }
  if (task.workspaceId !== BUSINESS_WORKSPACE_ID || task.createdBy !== userId) {
    throw new KaneoTaskMappingError("Business task access required.", 403);
  }
  if (task.integration?.kaneo?.taskId) {
    throw new KaneoTaskMappingError("This ProveIt task is already linked to Kaneo.", 409);
  }

  await taskRef.update({
    "integration.kaneo": {
      taskId: kaneo.taskId,
      projectId: kaneo.projectId,
      syncState: "synced",
      syncedAt: FieldValue.serverTimestamp(),
      lastSyncAt: FieldValue.serverTimestamp(),
    },
  });
}
