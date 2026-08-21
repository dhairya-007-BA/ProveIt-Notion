import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireWorkspaceUser: vi.fn(),
  updateAssignment: vi.fn(),
}));

vi.mock("@/lib/custom-field-route-auth", () => ({
  CustomFieldAuthError: class CustomFieldAuthError extends Error {
    constructor(message: string, public status: number) { super(message); }
  },
  requireCustomFieldWorkspaceUser: mocks.requireWorkspaceUser,
}));
vi.mock("@/lib/task-assignment-notification", () => ({
  TaskAssignmentNotificationError: class TaskAssignmentNotificationError extends Error {
    constructor(message: string, public status: number) { super(message); }
  },
  updateTaskAssignment: mocks.updateAssignment,
}));

import { CustomFieldAuthError } from "@/lib/custom-field-route-auth";
import { PATCH } from "@/app/api/workspaces/[workspaceId]/tasks/[taskId]/assignment/route";

describe("task assignment mutation route", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects an unauthorized caller before any assignment mutation", async () => {
    mocks.requireWorkspaceUser.mockRejectedValue(new CustomFieldAuthError("Workspace access required.", 403 as never));
    const response = await PATCH(new Request("http://localhost/api", { method: "PATCH", body: JSON.stringify({ assigneeId: "recipient" }) }), { params: Promise.resolve({ workspaceId: "technology", taskId: "task-1" }) });
    expect(response.status).toBe(403);
    expect(mocks.updateAssignment).not.toHaveBeenCalled();
  });

  it("uses the authenticated actor and treats assigneeId only as the requested task mutation", async () => {
    mocks.requireWorkspaceUser.mockResolvedValue({ uid: "trusted-actor" });
    mocks.updateAssignment.mockResolvedValue({ changed: true, notificationWarning: false });
    const response = await PATCH(new Request("http://localhost/api", { method: "PATCH", body: JSON.stringify({ assigneeId: "recipient" }) }), { params: Promise.resolve({ workspaceId: "technology", taskId: "task-1" }) });
    expect(response.status).toBe(200);
    expect(mocks.updateAssignment).toHaveBeenCalledWith("technology", "task-1", "trusted-actor", "recipient");
  });
});
