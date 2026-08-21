import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  type Snapshot = { exists: boolean; data: () => Record<string, unknown> };
  const snapshots = new Map<string, Snapshot>();
  const creates: Array<{ path: string; data: Record<string, unknown> }> = [];
  const ref = (collection: string, id: string) => ({ path: `${collection}/${id}`, id });
  const transaction = {
    get: vi.fn(async (target: { path: string }) => snapshots.get(target.path) ?? { exists: false, data: () => ({}) }),
    create: vi.fn((target: { path: string }, data: Record<string, unknown>) => { creates.push({ path: target.path, data }); }),
  };
  const collection = vi.fn((name: string) => ({
    doc: (id: string) => ref(name, id),
    where: () => ({ get: async () => ({ docs: [] }) }),
  }));
  return { snapshots, creates, transaction, collection };
});

const requireWorkspaceUser = vi.hoisted(() => vi.fn());

vi.mock("firebase-admin/firestore", () => ({
  FieldValue: { serverTimestamp: () => "server-time" },
  Timestamp: { fromDate: (date: Date) => ({ date }) },
}));
vi.mock("@/lib/custom-field-route-auth", () => ({ requireCustomFieldWorkspaceUser: requireWorkspaceUser }));
vi.mock("@/lib/firebase-admin", () => ({
  adminDb: {
    collection: mocks.collection,
    runTransaction: (callback: (transaction: typeof mocks.transaction) => unknown) => callback(mocks.transaction),
  },
}));

import { executeMeetingActionItems, meetingActionItemsFromIntelligence, parseMeetingExecutionInputs } from "@/lib/meeting-execution";

function snapshot(path: string, data: Record<string, unknown>) {
  mocks.snapshots.set(path, { exists: true, data: () => data });
}

const item = {
  proposalId: "proposal-1",
  title: "Ship the review workflow",
  description: "Keep human approval in the loop.",
  assigneeId: "employee-1",
  dueDate: "2026-09-01",
  priority: "high",
  status: "todo",
};

describe("meeting action-item execution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.snapshots.clear();
    mocks.creates.length = 0;
    requireWorkspaceUser.mockResolvedValue({ uid: "approver" });
    snapshot("meetings/meeting-1", { workspaceId: "technology" });
    snapshot("meetingIntelligence/meeting-1", {
      meetingId: "meeting-1",
      workspaceId: "technology",
      analysis: {
        status: "completed",
        output: { actionItems: [{ id: "proposal-1", title: "Original proposal", details: "Original context" }] },
      },
    });
    snapshot("users/employee-1", { active: true });
    snapshot("workspaceMemberships/technology_employee-1", { active: true });
  });

  it("parses only stable, unique action-item proposals", () => {
    expect(meetingActionItemsFromIntelligence({
      analysis: { output: { actionItems: [
        { id: "one", title: "First", details: "Context" },
        { id: "one", title: "Duplicate" },
        { id: "", title: "Missing id" },
      ] } },
    })).toEqual([{ id: "one", title: "First", details: "Context", suggestedAssignee: "", suggestedDueDate: "" }]);
  });

  it("rejects invalid dates and duplicate proposal IDs at the API boundary", () => {
    expect(() => parseMeetingExecutionInputs({ items: [{ ...item, dueDate: "2026-02-30" }] })).toThrow("valid task due date");
    expect(() => parseMeetingExecutionInputs({ items: [item, item] })).toThrow("only once");
  });

  it("rejects a forged proposal without writing a task", async () => {
    await expect(executeMeetingActionItems(new Request("http://local"), "technology", "meeting-1", {
      items: [{ ...item, proposalId: "forged-proposal" }],
    })).rejects.toThrow("no longer available");
    expect(mocks.transaction.create).not.toHaveBeenCalled();
  });

  it("rejects an assignee who lacks current workspace access", async () => {
    mocks.snapshots.delete("workspaceMemberships/technology_employee-1");
    await expect(executeMeetingActionItems(new Request("http://local"), "technology", "meeting-1", { items: [item] }))
      .rejects.toThrow("access to this workspace");
    expect(mocks.transaction.create).not.toHaveBeenCalled();
  });

  it("creates one provenance-linked task and returns the same task on retry", async () => {
    const first = await executeMeetingActionItems(new Request("http://local"), "technology", "meeting-1", { items: [item] });
    expect(first.results).toHaveLength(1);
    expect(first.results[0]).toMatchObject({ proposalId: "proposal-1", created: true, approvedBy: "approver", assigneeId: "employee-1" });
    const taskWrite = mocks.creates.find((write) => write.path.startsWith("tasks/"));
    expect(taskWrite?.data).toMatchObject({
      meetingId: "meeting-1",
      createdBy: "approver",
      provenance: { type: "meeting_ai_action_item", meetingId: "meeting-1", proposalId: "proposal-1", approvedBy: "approver", sourceTitle: "Original proposal" },
    });
    expect(mocks.creates).toContainEqual(expect.objectContaining({
      path: expect.stringMatching(/^meetingNotificationOutbox\/task_assignment_/),
      data: expect.objectContaining({ meetingId: "meeting-1", status: "pending" }),
    }));

    const executionWrite = mocks.creates.find((write) => write.path.startsWith("meetingTaskExecutions/"));
    expect(executionWrite).toBeDefined();
    snapshot(executionWrite!.path, executionWrite!.data);
    snapshot(taskWrite!.path, taskWrite!.data);
    mocks.creates.length = 0;
    mocks.transaction.create.mockClear();

    const retry = await executeMeetingActionItems(new Request("http://local"), "technology", "meeting-1", { items: [item] });
    expect(retry.results).toEqual([expect.objectContaining({ taskId: first.results[0].taskId, created: false, needsKaneoSync: true })]);
    expect(mocks.transaction.create).not.toHaveBeenCalled();
  });
});
