import "server-only";

import { adminDb } from "@/lib/firebase-admin";
import { dispatchCanonicalNotification } from "@/lib/notification-service";

const DEFAULT_BATCH_SIZE = 100;
const MAX_BATCH_SIZE = 200;
const LOOKBACK_MS = 24 * 60 * 60 * 1000;
const LOOKAHEAD_MS = 24 * 60 * 60 * 1000;

type ReminderDependencies = {
  db?: Pick<typeof adminDb, "collection">;
  dispatch?: typeof dispatchCanonicalNotification;
};

function asDate(value: unknown) {
  if (value instanceof Date) return value;
  if (value && typeof value === "object" && "toDate" in value && typeof (value as { toDate?: unknown }).toDate === "function") return (value as { toDate: () => Date }).toDate();
  return null;
}

function stableTime(date: Date) {
  return date.toISOString().replace(/[^0-9]/g, "");
}

/**
 * Bounded scheduled dispatcher. All recipients come from stored assignees or
 * participants; callers cannot supply recipient IDs or widen the time window.
 */
export async function dispatchDueAndMeetingReminders({ now = new Date(), batchSize = DEFAULT_BATCH_SIZE, dependencies = {} }: { now?: Date; batchSize?: number; dependencies?: ReminderDependencies } = {}) {
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) throw new Error("Invalid reminder dispatch time.");
  const limit = Math.min(Math.max(Math.floor(batchSize), 1), MAX_BATCH_SIZE);
  const lower = new Date(now.getTime() - LOOKBACK_MS);
  const upper = new Date(now.getTime() + LOOKAHEAD_MS);
  const taskLimit = Math.max(1, Math.floor(limit / 2));
  const db = dependencies.db ?? adminDb;
  const dispatch = dependencies.dispatch ?? dispatchCanonicalNotification;
  const [overdueTasks, upcomingTasks, meetings] = await Promise.all([
    db.collection("tasks").where("dueDate", ">=", lower).where("dueDate", "<=", now).orderBy("dueDate", "desc").limit(taskLimit).get(),
    db.collection("tasks").where("dueDate", ">", now).where("dueDate", "<=", upper).orderBy("dueDate", "asc").limit(taskLimit).get(),
    db.collection("meetings").where("startAt", ">=", now).where("startAt", "<=", upper).orderBy("startAt", "asc").limit(limit).get(),
  ]);
  const taskDocs = [...new Map([...overdueTasks.docs, ...upcomingTasks.docs].map((snapshot) => [snapshot.id, snapshot])).values()];
  const events = [] as Parameters<typeof dispatchCanonicalNotification>[0][];
  taskDocs.forEach((snapshot) => {
    const task = snapshot.data();
    const dueDate = asDate(task.dueDate);
    const assigneeId = typeof task.assigneeId === "string" ? task.assigneeId.trim() : "";
    const workspaceId = typeof task.workspaceId === "string" ? task.workspaceId.trim() : "";
    if (!dueDate || !assigneeId || !workspaceId || task.archived === true || task.status === "done") return;
    const overdue = dueDate.getTime() < now.getTime();
    events.push({
      eventId: `task_${overdue ? "overdue" : "due"}_${snapshot.id}_${stableTime(dueDate)}_${assigneeId}`,
      workspaceId,
      recipientUid: assigneeId,
      actorUid: null,
      eventType: overdue ? "task_overdue" : "task_due_reminder",
      entityType: "task",
      entityId: snapshot.id,
      title: overdue ? "Task overdue" : "Task due soon",
      message: `${typeof task.title === "string" && task.title.trim() ? task.title.trim() : "A task"} ${overdue ? "is overdue" : "is due within 24 hours"}.`,
    });
  });
  meetings.docs.forEach((snapshot) => {
    const meeting = snapshot.data();
    const startAt = asDate(meeting.startAt);
    const workspaceId = typeof meeting.workspaceId === "string" ? meeting.workspaceId.trim() : "";
    const participantIds = Array.isArray(meeting.participantIds) ? [...new Set(meeting.participantIds.filter((uid: unknown): uid is string => typeof uid === "string" && Boolean(uid.trim())).map((uid: string) => uid.trim()))] : [];
    if (!startAt || !workspaceId || meeting.status === "completed" || meeting.status === "cancelled") return;
    participantIds.forEach((recipientUid) => events.push({
      eventId: `meeting_reminder_${snapshot.id}_${stableTime(startAt)}_${recipientUid}`,
      workspaceId,
      recipientUid,
      actorUid: typeof meeting.organizerId === "string" ? meeting.organizerId : null,
      eventType: "meeting_reminder",
      entityType: "meeting",
      entityId: snapshot.id,
      title: "Meeting starting soon",
      message: `${typeof meeting.title === "string" && meeting.title.trim() ? meeting.title.trim() : "A meeting"} starts within 24 hours.`,
    }));
  });
  const outcomes = await Promise.allSettled(events.map((event) => dispatch(event)));
  const processed = outcomes.filter((result) => result.status === "fulfilled");
  const emailStatuses = processed.map((result) => result.value.email.status);
  return {
    scanned: { tasks: taskDocs.length, meetings: meetings.docs.length },
    events: events.length,
    processed: processed.length,
    notificationCreated: processed.filter((result) => result.value.notificationCreated).length,
    email: {
      sent: emailStatuses.filter((status) => status === "sent").length,
      suppressed: emailStatuses.filter((status) => status === "suppressed").length,
      unavailable: emailStatuses.filter((status) => status === "unavailable").length,
      failed: emailStatuses.filter((status) => status === "failed").length,
      duplicate: emailStatuses.filter((status) => status === "duplicate").length,
    },
    eventFailures: outcomes.filter((result) => result.status === "rejected").length,
    truncated: overdueTasks.docs.length === taskLimit || upcomingTasks.docs.length === taskLimit || meetings.docs.length === limit,
  };
}
