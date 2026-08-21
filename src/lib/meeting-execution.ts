import "server-only";

import { createHash } from "node:crypto";

import { FieldValue, Timestamp, type DocumentData, type Transaction } from "firebase-admin/firestore";

import { requireCustomFieldWorkspaceUser } from "@/lib/custom-field-route-auth";
import { adminDb } from "@/lib/firebase-admin";
import { enqueueMeetingNotification } from "@/lib/meeting-notification-outbox";
import type { TaskPriority, TaskStatus } from "@/types/task";

const PRIORITIES = new Set<TaskPriority>(["low", "medium", "high", "urgent"]);
const STATUSES = new Set<TaskStatus>(["todo", "in_progress", "blocked", "done"]);
const MAX_EXECUTIONS = 20;

export class MeetingExecutionError extends Error {
  constructor(
    message: string,
    public status: 400 | 403 | 404 | 409 | 422 | 503,
    public code: string,
  ) {
    super(message);
    this.name = "MeetingExecutionError";
  }
}

export type StoredMeetingActionItem = {
  id: string;
  title: string;
  details: string;
  suggestedAssignee: string;
  suggestedDueDate: string;
};

export type MeetingExecutionInput = {
  proposalId: string;
  title: string;
  description: string;
  assigneeId: string | null;
  dueDate: string | null;
  priority: TaskPriority;
  status: TaskStatus;
};

export type MeetingExecutionResult = {
  proposalId: string;
  taskId: string;
  created: boolean;
  title: string;
  description: string;
  priority: TaskPriority;
  assigneeId: string | null;
  approvedBy: string;
  needsKaneoSync: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function meetingActionItemsFromIntelligence(data: unknown): StoredMeetingActionItem[] {
  if (!isRecord(data)) return [];
  const analysis = isRecord(data.analysis) ? data.analysis : null;
  const output = analysis && isRecord(analysis.output) ? analysis.output : null;
  if (!output || !Array.isArray(output.actionItems)) return [];

  const seen = new Set<string>();
  return output.actionItems.flatMap((value) => {
    if (!isRecord(value)) return [];
    const id = text(value.id);
    const title = text(value.title);
    if (!id || !title || seen.has(id)) return [];
    seen.add(id);
    return [{
      id,
      title,
      details: text(value.details),
      suggestedAssignee: text(value.suggestedAssignee),
      suggestedDueDate: text(value.suggestedDueDate),
    }];
  });
}

function dateFromInput(value: string | null) {
  if (value === null) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new MeetingExecutionError("Choose a valid task due date.", 422, "invalid_due_date");
  }
  const date = new Date(`${value}T12:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new MeetingExecutionError("Choose a valid task due date.", 422, "invalid_due_date");
  }
  return Timestamp.fromDate(date);
}

export function parseMeetingExecutionInputs(value: unknown): MeetingExecutionInput[] {
  if (!isRecord(value) || !Array.isArray(value.items) || value.items.length === 0 || value.items.length > MAX_EXECUTIONS) {
    throw new MeetingExecutionError(`Choose between 1 and ${MAX_EXECUTIONS} action items.`, 422, "invalid_execution_count");
  }
  const seen = new Set<string>();
  return value.items.map((item) => {
    if (!isRecord(item)) throw new MeetingExecutionError("Every action item must be valid.", 422, "invalid_execution");
    const proposalId = text(item.proposalId);
    const title = text(item.title);
    const description = typeof item.description === "string" ? item.description.trim() : "";
    const assigneeId = item.assigneeId === null || item.assigneeId === "" ? null : text(item.assigneeId);
    const dueDate = item.dueDate === null || item.dueDate === "" ? null : text(item.dueDate);
    const priority = item.priority as TaskPriority;
    const status = item.status as TaskStatus;
    if (!proposalId || seen.has(proposalId)) throw new MeetingExecutionError("Each proposal can be approved only once per request.", 422, "duplicate_proposal");
    if (!title || title.length > 200) throw new MeetingExecutionError("Task titles must be between 1 and 200 characters.", 422, "invalid_title");
    if (description.length > 5_000) throw new MeetingExecutionError("Task descriptions must be 5,000 characters or fewer.", 422, "invalid_description");
    if (assigneeId && assigneeId.length > 128) throw new MeetingExecutionError("Choose a valid task assignee.", 422, "invalid_assignee");
    if (!PRIORITIES.has(priority)) throw new MeetingExecutionError("Choose a valid task priority.", 422, "invalid_priority");
    if (!STATUSES.has(status)) throw new MeetingExecutionError("Choose a valid task status.", 422, "invalid_status");
    dateFromInput(dueDate);
    seen.add(proposalId);
    return { proposalId, title, description, assigneeId, dueDate, priority, status };
  });
}

function executionKey(meetingId: string, proposalId: string) {
  return createHash("sha256").update(`${meetingId}\u0000${proposalId}`).digest("hex").slice(0, 32);
}

function taskIdFor(meetingId: string, proposalId: string) {
  return `meeting-${executionKey(meetingId, proposalId)}`;
}

async function assertAssignable(
  transaction: Transaction,
  workspaceId: string,
  assigneeIds: string[],
) {
  await Promise.all(assigneeIds.map(async (uid) => {
    const [profile, membership] = await Promise.all([
      transaction.get(adminDb.collection("users").doc(uid)),
      transaction.get(adminDb.collection("workspaceMemberships").doc(`${workspaceId}_${uid}`)),
    ]);
    const user = profile.data();
    const bod = user?.role === "bod" || user?.group === "bod";
    const eligible = profile.exists && user?.active === true && (
      workspaceId === "company" ||
      (workspaceId === "board" ? bod : bod || (membership.exists && membership.data()?.active === true))
    );
    if (!eligible) throw new MeetingExecutionError("Choose an active employee with access to this workspace.", 422, "invalid_assignee");
  }));
}

function existingResult(proposalId: string, data: DocumentData | undefined, task: DocumentData | undefined): MeetingExecutionResult {
  if (!data || typeof data.taskId !== "string") {
    throw new MeetingExecutionError("The existing execution record is invalid.", 503, "invalid_execution_record");
  }
  return {
    proposalId,
    taskId: data.taskId,
    created: false,
    title: typeof data.taskTitle === "string" ? data.taskTitle : "Meeting action item",
    description: typeof data.taskDescription === "string" ? data.taskDescription : "",
    priority: PRIORITIES.has(data.taskPriority as TaskPriority) ? data.taskPriority as TaskPriority : "medium",
    assigneeId: typeof data.assigneeId === "string" ? data.assigneeId : null,
    approvedBy: typeof data.approvedBy === "string" ? data.approvedBy : "",
    needsKaneoSync: !(task?.integration && typeof task.integration === "object" && task.integration.kaneo),
  };
}

export async function executeMeetingActionItems(
  request: Request,
  workspaceId: string,
  meetingId: string,
  body: unknown,
) {
  const actor = await requireCustomFieldWorkspaceUser(request, workspaceId);
  const inputs = parseMeetingExecutionInputs(body);

  return adminDb.runTransaction(async (transaction) => {
    const meetingRef = adminDb.collection("meetings").doc(meetingId);
    const intelligenceRef = adminDb.collection("meetingIntelligence").doc(meetingId);
    const [meeting, intelligence] = await Promise.all([
      transaction.get(meetingRef),
      transaction.get(intelligenceRef),
    ]);
    if (!meeting.exists || meeting.data()?.workspaceId !== workspaceId) {
      throw new MeetingExecutionError("Meeting not found.", 404, "meeting_not_found");
    }
    if (!intelligence.exists || intelligence.data()?.workspaceId !== workspaceId || intelligence.data()?.meetingId !== meetingId) {
      throw new MeetingExecutionError("Completed meeting intelligence is required before creating tasks.", 409, "intelligence_not_ready");
    }
    const analysis = isRecord(intelligence.data()?.analysis) ? intelligence.data()!.analysis as Record<string, unknown> : null;
    if (analysis?.status !== "completed") {
      throw new MeetingExecutionError("Completed meeting intelligence is required before creating tasks.", 409, "intelligence_not_ready");
    }
    const stored = new Map(meetingActionItemsFromIntelligence(intelligence.data()).map((item) => [item.id, item]));
    if (inputs.some((input) => !stored.has(input.proposalId))) {
      throw new MeetingExecutionError("One or more action-item proposals are no longer available.", 409, "proposal_not_found");
    }

    const assigneeIds = [...new Set(inputs.flatMap((input) => input.assigneeId ? [input.assigneeId] : []))];
    await assertAssignable(transaction, workspaceId, assigneeIds);

    const executionRefs = inputs.map((input) => adminDb.collection("meetingTaskExecutions").doc(executionKey(meetingId, input.proposalId)));
    const executionSnapshots = await Promise.all(executionRefs.map((ref) => transaction.get(ref)));
    const existingTasks = await Promise.all(executionSnapshots.map((execution) => {
      const taskId = execution.data()?.taskId;
      return execution.exists && typeof taskId === "string"
        ? transaction.get(adminDb.collection("tasks").doc(taskId))
        : Promise.resolve(null);
    }));
    const now = FieldValue.serverTimestamp();
    const results: MeetingExecutionResult[] = [];

    inputs.forEach((input, index) => {
      const storedProposal = stored.get(input.proposalId)!;
      const execution = executionSnapshots[index];
      if (execution.exists) {
        const data = execution.data();
        if (data?.workspaceId !== workspaceId || data?.meetingId !== meetingId || data?.proposalId !== input.proposalId) {
          throw new MeetingExecutionError("A conflicting execution record already exists.", 409, "execution_conflict");
        }
        if (!existingTasks[index]?.exists) throw new MeetingExecutionError("The previously created task could not be found.", 409, "task_not_found");
        results.push(existingResult(input.proposalId, data, existingTasks[index]!.data()));
        return;
      }

      const taskId = taskIdFor(meetingId, input.proposalId);
      const taskRef = adminDb.collection("tasks").doc(taskId);
      const dueDate = dateFromInput(input.dueDate);
      transaction.create(taskRef, {
        title: input.title,
        description: input.description,
        workspaceId,
        status: input.status,
        priority: input.priority,
        assigneeId: input.assigneeId,
        dueDate,
        createdBy: actor.uid,
        createdAt: now,
        updatedAt: now,
        source: "proveit",
        archived: false,
        meetingId,
        provenance: {
          type: "meeting_ai_action_item",
          meetingId,
          proposalId: input.proposalId,
          sourceTitle: storedProposal.title,
          approvedBy: actor.uid,
          approvedAt: now,
        },
      });
      transaction.create(adminDb.collection("activity").doc(`meeting-ai-${executionKey(meetingId, input.proposalId)}`), {
        workspaceId,
        entityType: "task",
        entityId: taskId,
        action: "created",
        userId: actor.uid,
        description: `Created task \"${input.title}\" from meeting intelligence`,
        previousValue: null,
        newValue: { title: input.title, status: input.status, priority: input.priority, assigneeId: input.assigneeId, meetingId, proposalId: input.proposalId },
        source: "proveit",
        createdAt: now,
      });
      transaction.create(executionRefs[index], {
        workspaceId,
        meetingId,
        proposalId: input.proposalId,
        taskId,
        taskTitle: input.title,
        taskDescription: input.description,
        taskPriority: input.priority,
        assigneeId: input.assigneeId,
        approvedBy: actor.uid,
        approvedAt: now,
      });
      if (input.assigneeId && input.assigneeId !== actor.uid) {
        enqueueMeetingNotification(transaction, meetingId, {
          eventId: `task_assignment_${executionKey(taskId, input.assigneeId)}`,
          workspaceId,
          recipientUid: input.assigneeId,
          actorUid: actor.uid,
          eventType: "task_assignment",
          entityType: "task",
          entityId: taskId,
          title: "New task assignment",
          message: `You were assigned “${input.title}” from a meeting action item.`,
        });
      }
      results.push({ proposalId: input.proposalId, taskId, created: true, title: input.title, description: input.description, priority: input.priority, assigneeId: input.assigneeId, approvedBy: actor.uid, needsKaneoSync: true });
    });

    return { results };
  });
}

export async function listMeetingTaskExecutions(request: Request, workspaceId: string, meetingId: string) {
  await requireCustomFieldWorkspaceUser(request, workspaceId);
  const meeting = await adminDb.collection("meetings").doc(meetingId).get();
  if (!meeting.exists || meeting.data()?.workspaceId !== workspaceId) {
    throw new MeetingExecutionError("Meeting not found.", 404, "meeting_not_found");
  }
  const snapshot = await adminDb.collection("meetingTaskExecutions").where("meetingId", "==", meetingId).get();
  const records = await Promise.all(snapshot.docs.map(async (document) => {
    const data = document.data();
    if (data.workspaceId !== workspaceId || typeof data.proposalId !== "string" || typeof data.taskId !== "string") return null;
    const task = await adminDb.collection("tasks").doc(data.taskId).get();
    const taskData = task.data();
    if (!task.exists || taskData?.workspaceId !== workspaceId) return null;
    return {
      proposalId: data.proposalId,
      taskId: data.taskId,
      approvedBy: typeof data.approvedBy === "string" ? data.approvedBy : "",
      title: typeof taskData.title === "string" ? taskData.title : typeof data.taskTitle === "string" ? data.taskTitle : "Meeting action item",
      description: typeof taskData.description === "string" ? taskData.description : typeof data.taskDescription === "string" ? data.taskDescription : "",
      priority: PRIORITIES.has(taskData.priority as TaskPriority) ? taskData.priority as TaskPriority : "medium" as const,
      needsKaneoSync: !(taskData.integration && typeof taskData.integration === "object" && taskData.integration.kaneo),
    };
  }));
  return records.filter((record): record is NonNullable<typeof record> => record !== null);
}
