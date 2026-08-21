import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { dispatchDueAndMeetingReminders } from "@/lib/reminder-dispatcher";
import type { CanonicalNotificationEvent } from "@/lib/notification-service";

function document(id: string, data: Record<string, unknown>) { return { id, data: () => data }; }

function database(taskDocs: ReturnType<typeof document>[], meetingDocs: ReturnType<typeof document>[]) {
  const limits: number[] = [];
  return {
    limits,
    db: {
      collection: (name: string) => {
        const query = {
          where: () => query,
          orderBy: () => query,
          limit: (value: number) => { limits.push(value); return query; },
          get: async () => ({ docs: name === "tasks" ? taskDocs : meetingDocs }),
        };
        return query;
      },
    },
  };
}

describe("reminder dispatcher", () => {
  it("derives deterministic task and meeting recipients from bounded stored records", async () => {
    const now = new Date("2026-08-20T12:00:00.000Z");
    const { db, limits } = database([
      document("overdue-task", { workspaceId: "technology", assigneeId: "employee-1", title: "Ship release", status: "in_progress", dueDate: new Date("2026-08-20T10:00:00.000Z") }),
      document("done-task", { workspaceId: "technology", assigneeId: "employee-2", status: "done", dueDate: new Date("2026-08-20T10:00:00.000Z") }),
    ], [
      document("meeting-1", { workspaceId: "company", organizerId: "organizer", participantIds: ["employee-1", "employee-1", "employee-2"], title: "Hiring review", status: "scheduled", startAt: new Date("2026-08-20T15:00:00.000Z") }),
      document("cancelled", { workspaceId: "company", participantIds: ["employee-3"], status: "cancelled", startAt: new Date("2026-08-20T15:00:00.000Z") }),
    ]);
    const dispatch = vi.fn(async (event: CanonicalNotificationEvent) => { void event; return { notificationCreated: true, email: { status: "suppressed" as const } }; });
    const result = await dispatchDueAndMeetingReminders({ now, batchSize: 500, dependencies: { db: db as never, dispatch } });
    expect(limits).toEqual([100, 100, 200]);
    expect(result).toMatchObject({ scanned: { tasks: 2, meetings: 2 }, events: 3, processed: 3, notificationCreated: 3, email: { sent: 0, suppressed: 3, unavailable: 0, failed: 0 }, eventFailures: 0 });
    expect(dispatch.mock.calls.map(([event]) => event)).toEqual(expect.arrayContaining([
      expect.objectContaining({ eventId: "task_overdue_overdue-task_20260820100000000_employee-1", recipientUid: "employee-1", eventType: "task_overdue" }),
      expect.objectContaining({ eventId: "meeting_reminder_meeting-1_20260820150000000_employee-1", recipientUid: "employee-1", eventType: "meeting_reminder" }),
      expect.objectContaining({ eventId: "meeting_reminder_meeting-1_20260820150000000_employee-2", recipientUid: "employee-2", eventType: "meeting_reminder" }),
    ]));
  });

  it("isolates per-event failures and reports them without exposing recipient data", async () => {
    const now = new Date("2026-08-20T12:00:00.000Z");
    const { db } = database([document("task", { workspaceId: "business", assigneeId: "employee", title: "Follow up", status: "todo", dueDate: new Date("2026-08-21T10:00:00.000Z") })], []);
    const dispatch = vi.fn(async (event: CanonicalNotificationEvent) => { void event; throw new Error("provider failed"); });
    await expect(dispatchDueAndMeetingReminders({ now, dependencies: { db: db as never, dispatch } })).resolves.toMatchObject({ events: 1, processed: 0, notificationCreated: 0, email: { sent: 0, suppressed: 0, unavailable: 0, failed: 0 }, eventFailures: 1 });
  });
});
