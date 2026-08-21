import "server-only";

import { createHash } from "node:crypto";

import { FieldValue, Timestamp, type Firestore } from "firebase-admin/firestore";

import { adminDb } from "@/lib/firebase-admin";
import { dispatchCanonicalNotification, type CanonicalNotificationEvent } from "@/lib/notification-service";

const statuses = ["todo", "in_progress", "blocked", "done"] as const;
const priorities = ["low", "medium", "high", "urgent"] as const;
type AssignmentEventType = "task_assignment" | "task_reassignment";
type AssignmentDependencies = { db: Pick<Firestore, "collection" | "runTransaction">; dispatch: typeof dispatchCanonicalNotification };
const defaults: AssignmentDependencies = { db: adminDb, dispatch: dispatchCanonicalNotification };

function optionalAssignee(value: unknown) {
  if (value === null || value === "" || value === undefined) return null;
  if (typeof value !== "string" || !value.trim() || value.trim().length > 128) throw new TaskAssignmentNotificationError("Invalid task assignee.", 422);
  return value.trim();
}

function requiredText(value: unknown, label: string, max: number) {
  if (typeof value !== "string") throw new TaskAssignmentNotificationError(`Invalid ${label}.`, 422);
  const normalized = value.trim();
  if (!normalized || normalized.length > max || /[\u0000-\u001F\u007F]/.test(normalized)) throw new TaskAssignmentNotificationError(`Invalid ${label}.`, 422);
  return normalized;
}

function taskDescription(value: unknown) {
  if (value === undefined || value === null || value === "") return "";
  if (typeof value !== "string" || value.length > 20_000 || /[\u0000\u007F]/.test(value)) throw new TaskAssignmentNotificationError("Invalid task description.", 422);
  return value.trim();
}

function taskDueDate(value: unknown) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") throw new TaskAssignmentNotificationError("Invalid task due date.", 422);
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new TaskAssignmentNotificationError("Invalid task due date.", 422);
  return Timestamp.fromDate(parsed);
}

function makeEventId(type: AssignmentEventType, workspaceId: string, taskId: string, revision: number, recipientUid: string) {
  const hash = createHash("sha256").update(`${workspaceId}\u0000${taskId}\u0000${revision}\u0000${recipientUid}\u0000${type}`).digest("hex");
  return `${type}_${hash}`;
}

function makeEvent(type: AssignmentEventType, id: string, workspaceId: string, taskId: string, recipientUid: string, actorUid: string, title: string): CanonicalNotificationEvent {
  return { eventId: id, workspaceId, recipientUid, actorUid, eventType: type, entityType: "task", entityId: taskId, title: type === "task_assignment" ? "New task assignment" : "Task reassigned to you", message: `You were assigned to “${title}”.` };
}

function queueEvent(transaction: FirebaseFirestore.Transaction, db: AssignmentDependencies["db"], event: CanonicalNotificationEvent) {
  transaction.set(db.collection("notificationOutbox").doc(event.eventId), { ...event, status: "pending", attempts: 0, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
}

async function requireAssignableEmployee(transaction: FirebaseFirestore.Transaction, db: AssignmentDependencies["db"], workspaceId: string, assigneeId: string | null) {
  if (!assigneeId) return;
  const userRef = db.collection("users").doc(assigneeId);
  const membershipRef = db.collection("workspaceMemberships").doc(`${workspaceId}_${assigneeId}`);
  const [user, membership] = await Promise.all([transaction.get(userRef), transaction.get(membershipRef)]);
  const profile = user.data();
  const bod = profile?.group === "bod" || profile?.role === "bod";
  const eligible = user.exists && profile?.active === true && (
    workspaceId === "company" ||
    (workspaceId === "board" ? bod : bod || (membership.exists && membership.data()?.active === true))
  );
  if (!eligible) throw new TaskAssignmentNotificationError("Assignee is not an active member of this workspace.", 422);
}

function eventFromOutbox(id: string, data: Record<string, unknown>): CanonicalNotificationEvent {
  const type = data.eventType;
  if (type !== "task_assignment" && type !== "task_reassignment") throw new Error("Invalid assignment outbox event.");
  return {
    eventId: id,
    workspaceId: requiredText(data.workspaceId, "workspace id", 120),
    recipientUid: requiredText(data.recipientUid, "recipient", 128),
    actorUid: requiredText(data.actorUid, "actor", 128),
    eventType: type,
    entityType: "task",
    entityId: requiredText(data.entityId, "task id", 500),
    title: requiredText(data.title, "notification title", 120),
    message: requiredText(data.message, "notification message", 500),
  };
}

export async function dispatchTaskAssignmentOutboxEvent(id: string, dependencies: AssignmentDependencies = defaults) {
  const ref = dependencies.db.collection("notificationOutbox").doc(id);
  const snapshot = await ref.get();
  if (!snapshot.exists || snapshot.data()?.status !== "pending") return { delivered: false, status: "missing_or_complete" as const };
  try {
    const event = eventFromOutbox(snapshot.id, snapshot.data()!);
    await dependencies.dispatch(event);
    await dependencies.db.runTransaction(async (transaction) => {
      const taskRef = dependencies.db.collection("tasks").doc(event.entityId);
      const task = await transaction.get(taskRef);
      transaction.update(ref, { status: "delivered", deliveredAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(), attempts: FieldValue.increment(1) });
      if (task.exists && task.data()?.assignmentNotification?.eventId === event.eventId) {
        transaction.update(taskRef, { "assignmentNotification.status": "dispatched", "assignmentNotification.dispatchedAt": FieldValue.serverTimestamp(), "assignmentNotification.updatedAt": FieldValue.serverTimestamp() });
      }
    });
    return { delivered: true, status: "delivered" as const };
  } catch (error) {
    await ref.update({ lastAttemptAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(), attempts: FieldValue.increment(1), lastError: error instanceof Error ? error.name : "unknown" });
    throw error;
  }
}

export async function drainPendingTaskAssignmentEvents(limit = 100, dependencies: AssignmentDependencies = defaults) {
  const pending = await dependencies.db.collection("notificationOutbox").where("status", "==", "pending").limit(Math.min(Math.max(Math.floor(limit), 1), 200)).get();
  const outcomes = await Promise.allSettled(pending.docs.map((doc) => dispatchTaskAssignmentOutboxEvent(doc.id, dependencies)));
  return { scanned: pending.docs.length, delivered: outcomes.filter((result) => result.status === "fulfilled" && result.value.delivered).length, failed: outcomes.filter((result) => result.status === "rejected").length };
}

export async function createTaskWithAssignmentEvent(workspaceId: string, actorUid: string, raw: unknown, dependencies: AssignmentDependencies = defaults) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new TaskAssignmentNotificationError("Invalid task.", 422);
  const input = raw as Record<string, unknown>;
  const title = requiredText(input.title, "task title", 500);
  const description = taskDescription(input.description);
  const status = statuses.includes(input.status as typeof statuses[number]) ? input.status as typeof statuses[number] : null;
  const priority = priorities.includes(input.priority as typeof priorities[number]) ? input.priority as typeof priorities[number] : null;
  if (!status || !priority) throw new TaskAssignmentNotificationError("Invalid task status or priority.", 422);
  const assigneeId = optionalAssignee(input.assigneeId);
  const taskRef = dependencies.db.collection("tasks").doc();
  const activityRef = dependencies.db.collection("activity").doc();
  let queuedEventId: string | null = null;

  await dependencies.db.runTransaction(async (transaction) => {
    await requireAssignableEmployee(transaction, dependencies.db, workspaceId, assigneeId);
    const notificationStatus = assigneeId && assigneeId !== actorUid ? "pending" : assigneeId ? "suppressed_self" : "unassigned";
    transaction.set(taskRef, { title, description, workspaceId, status, priority, assigneeId, dueDate: taskDueDate(input.dueDate), createdBy: actorUid, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(), source: "proveit", archived: false, assignmentNotification: { observedAssigneeId: assigneeId, revision: assigneeId ? 1 : 0, hasBeenAssigned: Boolean(assigneeId), status: notificationStatus } });
    transaction.set(activityRef, { workspaceId, entityType: "task", entityId: taskRef.id, action: "created", userId: actorUid, description: `Created task "${title}"`, previousValue: null, newValue: { title, status, priority, assigneeId }, source: "proveit", createdAt: FieldValue.serverTimestamp() });
    if (assigneeId && assigneeId !== actorUid) {
      queuedEventId = makeEventId("task_assignment", workspaceId, taskRef.id, 1, assigneeId);
      queueEvent(transaction, dependencies.db, makeEvent("task_assignment", queuedEventId, workspaceId, taskRef.id, assigneeId, actorUid, title));
      transaction.update(taskRef, { "assignmentNotification.eventId": queuedEventId });
    }
  });
  let notificationWarning = false;
  if (queuedEventId) try { await dispatchTaskAssignmentOutboxEvent(queuedEventId, dependencies); } catch { notificationWarning = true; }
  return { taskId: taskRef.id, notificationWarning };
}

export async function updateTaskAssignment(workspaceId: string, taskId: string, actorUid: string, requestedAssignee: unknown, dependencies: AssignmentDependencies = defaults) {
  if (requestedAssignee === undefined) throw new TaskAssignmentNotificationError("Task assignee is required.", 422);
  const assigneeId = optionalAssignee(requestedAssignee);
  const taskRef = dependencies.db.collection("tasks").doc(taskId);
  let queuedEventId: string | null = null;
  let changed = false;
  await dependencies.db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(taskRef);
    if (!snapshot.exists || snapshot.data()?.workspaceId !== workspaceId) throw new TaskAssignmentNotificationError("Task not found.", 404);
    const task = snapshot.data()!;
    const previousAssignee = typeof task.assigneeId === "string" && task.assigneeId.trim() ? task.assigneeId.trim() : null;
    if (previousAssignee === assigneeId) return;
    await requireAssignableEmployee(transaction, dependencies.db, workspaceId, assigneeId);
    changed = true;
    const prior = task.assignmentNotification && typeof task.assignmentNotification === "object" ? task.assignmentNotification as Record<string, unknown> : {};
    const revision = typeof prior.revision === "number" && Number.isSafeInteger(prior.revision) ? prior.revision + 1 : 1;
    const hadAssignment = previousAssignee !== null || prior.hasBeenAssigned === true;
    const type: AssignmentEventType = hadAssignment ? "task_reassignment" : "task_assignment";
    const state: Record<string, unknown> = { observedAssigneeId: assigneeId, revision, hasBeenAssigned: hadAssignment || Boolean(assigneeId), status: !assigneeId ? "unassigned" : assigneeId === actorUid ? "suppressed_self" : "pending", updatedAt: FieldValue.serverTimestamp() };
    if (assigneeId && assigneeId !== actorUid) {
      queuedEventId = makeEventId(type, workspaceId, taskId, revision, assigneeId);
      state.eventId = queuedEventId;
      queueEvent(transaction, dependencies.db, makeEvent(type, queuedEventId, workspaceId, taskId, assigneeId, actorUid, requiredText(task.title, "task title", 500)));
    }
    transaction.update(taskRef, { assigneeId, assignmentNotification: state, updatedAt: FieldValue.serverTimestamp() });
  });
  let notificationWarning = false;
  if (queuedEventId) try { await dispatchTaskAssignmentOutboxEvent(queuedEventId, dependencies); } catch { notificationWarning = true; }
  return { changed, notificationWarning };
}

export class TaskAssignmentNotificationError extends Error {
  constructor(message: string, public status: 404 | 422) { super(message); this.name = "TaskAssignmentNotificationError"; }
}
