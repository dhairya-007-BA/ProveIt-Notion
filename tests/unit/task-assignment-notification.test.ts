import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("firebase-admin/firestore", () => ({
  FieldValue: { serverTimestamp: () => "server-time", increment: (value: number) => ({ increment: value }) },
  Timestamp: { fromDate: (value: Date) => value },
}));
vi.mock("@/lib/firebase-admin", () => ({ adminDb: {} }));
vi.mock("@/lib/notification-service", () => ({ dispatchCanonicalNotification: vi.fn() }));

import { createTaskWithAssignmentEvent, drainPendingTaskAssignmentEvents, updateTaskAssignment } from "@/lib/task-assignment-notification";
import type { CanonicalNotificationEvent } from "@/lib/notification-service";

type RecordMap = Map<string, Record<string, unknown>>;

function harness(seed: Record<string, Record<string, unknown>> = {}) {
  const records: RecordMap = new Map(Object.entries(seed));
  let autoId = 0;
  const makeRef = (path: string) => ({
    path,
    id: path.split("/").at(-1)!,
    get: async () => ({ exists: records.has(path), id: path.split("/").at(-1)!, data: () => records.get(path) }),
    update: async (fields: Record<string, unknown>) => apply(path, fields),
  });
  const apply = (path: string, fields: Record<string, unknown>) => {
    const current = records.get(path) ?? {};
    for (const [key, value] of Object.entries(fields)) {
      if (key.includes(".")) {
        const [parent, child] = key.split(".");
        current[parent] = { ...((current[parent] as Record<string, unknown>) ?? {}), [child]: value };
      } else if (value && typeof value === "object" && "increment" in value) current[key] = Number(current[key] ?? 0) + Number((value as { increment: number }).increment);
      else current[key] = value;
    }
    records.set(path, current);
  };
  const transaction = {
    get: async (ref: { path: string; id: string }) => ({ exists: records.has(ref.path), id: ref.id, data: () => records.get(ref.path) }),
    set: (ref: { path: string }, value: Record<string, unknown>) => records.set(ref.path, structuredClone(value)),
    update: (ref: { path: string }, fields: Record<string, unknown>) => apply(ref.path, fields),
  };
  const collection = vi.fn((name: string) => ({
    doc: (id?: string) => makeRef(`${name}/${id ?? `auto-${++autoId}`}`),
    where: () => ({ limit: () => ({ get: async () => ({ docs: [...records.entries()].filter(([path, value]) => path.startsWith(`${name}/`) && value.status === "pending").map(([path, value]) => ({ id: path.split("/").at(-1)!, data: () => value })) }) }) }),
  }));
  const db = { collection, runTransaction: async (callback: (value: typeof transaction) => Promise<unknown>) => callback(transaction) };
  const dispatch = vi.fn(async (event: CanonicalNotificationEvent) => { void event; return { notificationCreated: true, email: { status: "suppressed" } }; });
  return { records, dispatch, dependencies: { db, dispatch } };
}

describe("authoritative task assignment events", () => {
  it("commits assignment and its durable outbox before immediate delivery", async () => {
    const test = harness({ "tasks/task-1": { workspaceId: "technology", title: "Ship release", assigneeId: null }, "users/recipient": { active: true }, "workspaceMemberships/technology_recipient": { active: true } });
    const result = await updateTaskAssignment("technology", "task-1", "actor", "recipient", test.dependencies as never);

    expect(result).toEqual({ changed: true, notificationWarning: false });
    expect(test.records.get("tasks/task-1")).toMatchObject({ assigneeId: "recipient", assignmentNotification: { status: "dispatched", observedAssigneeId: "recipient" } });
    const outbox = [...test.records.entries()].find(([path]) => path.startsWith("notificationOutbox/"))!;
    expect(outbox[1]).toMatchObject({ recipientUid: "recipient", actorUid: "actor", status: "delivered", eventType: "task_assignment" });
    expect(test.dispatch).toHaveBeenCalledTimes(1);
  });

  it("leaves a failed delivery pending so the scheduled drainer can recover it idempotently", async () => {
    const test = harness({ "tasks/task-1": { workspaceId: "technology", title: "Retry release", assigneeId: null }, "users/recipient": { active: true }, "workspaceMemberships/technology_recipient": { active: true } });
    test.dispatch.mockRejectedValueOnce(new Error("interrupted after commit"));
    await expect(updateTaskAssignment("technology", "task-1", "actor", "recipient", test.dependencies as never)).resolves.toEqual({ changed: true, notificationWarning: true });
    const pending = [...test.records.entries()].find(([path]) => path.startsWith("notificationOutbox/"))!;
    expect(pending[1]).toMatchObject({ status: "pending", recipientUid: "recipient" });

    await expect(drainPendingTaskAssignmentEvents(100, test.dependencies as never)).resolves.toEqual({ scanned: 1, delivered: 1, failed: 0 });
    expect(pending[1]).toMatchObject({ status: "delivered" });
    expect(test.dispatch.mock.calls[0]![0].eventId).toBe(test.dispatch.mock.calls[1]![0].eventId);
  });

  it("does not queue unchanged or self-assignment events", async () => {
    const unchanged = harness({ "tasks/task-1": { workspaceId: "business", title: "Same", assigneeId: "recipient" } });
    await expect(updateTaskAssignment("business", "task-1", "actor", "recipient", unchanged.dependencies as never)).resolves.toEqual({ changed: false, notificationWarning: false });
    const self = harness({ "tasks/task-1": { workspaceId: "business", title: "Own", assigneeId: null }, "users/actor": { active: true }, "workspaceMemberships/business_actor": { active: true } });
    await updateTaskAssignment("business", "task-1", "actor", "actor", self.dependencies as never);
    expect(unchanged.dispatch).not.toHaveBeenCalled();
    expect(self.dispatch).not.toHaveBeenCalled();
    expect([...self.records.keys()].some((path) => path.startsWith("notificationOutbox/"))).toBe(false);
  });

  it("creates the task, activity, and recipient-derived outbox in one trusted transaction", async () => {
    const test = harness({ "users/recipient": { active: true }, "workspaceMemberships/technology_recipient": { active: true } });
    const result = await createTaskWithAssignmentEvent("technology", "actor", { title: "New task", description: "", status: "todo", priority: "high", assigneeId: "recipient", dueDate: null }, test.dependencies as never);
    expect(test.records.get(`tasks/${result.taskId}`)).toMatchObject({ createdBy: "actor", assigneeId: "recipient" });
    expect([...test.records.values()]).toEqual(expect.arrayContaining([expect.objectContaining({ entityType: "task", userId: "actor" }), expect.objectContaining({ recipientUid: "recipient", actorUid: "actor" })]));
  });

  it("rejects cross-workspace task mutation without creating an event", async () => {
    const test = harness({ "tasks/task-1": { workspaceId: "business", title: "Private", assigneeId: null } });
    await expect(updateTaskAssignment("technology", "task-1", "actor", "recipient", test.dependencies as never)).rejects.toMatchObject({ status: 404 });
    expect(test.dispatch).not.toHaveBeenCalled();
  });

  it("rejects inactive and cross-workspace assignees before mutating the task", async () => {
    const inactive = harness({ "tasks/task-1": { workspaceId: "technology", title: "Protected", assigneeId: null }, "users/recipient": { active: false }, "workspaceMemberships/technology_recipient": { active: true } });
    await expect(updateTaskAssignment("technology", "task-1", "actor", "recipient", inactive.dependencies as never)).rejects.toMatchObject({ status: 422 });
    expect(inactive.records.get("tasks/task-1")!.assigneeId).toBeNull();

    const otherWorkspace = harness({ "tasks/task-1": { workspaceId: "technology", title: "Protected", assigneeId: null }, "users/recipient": { active: true }, "workspaceMemberships/business_recipient": { active: true } });
    await expect(updateTaskAssignment("technology", "task-1", "actor", "recipient", otherWorkspace.dependencies as never)).rejects.toMatchObject({ status: 422 });
    expect(otherWorkspace.records.get("tasks/task-1")!.assigneeId).toBeNull();
  });
});
