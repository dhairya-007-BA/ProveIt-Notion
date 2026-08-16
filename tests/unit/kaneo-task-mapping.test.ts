import { beforeEach, describe, expect, it, vi } from "vitest";

const { get, update, serverTimestamp } = vi.hoisted(() => ({ get: vi.fn(), update: vi.fn(), serverTimestamp: vi.fn(() => "timestamp") }));
vi.mock("firebase-admin/firestore", () => ({ FieldValue: { serverTimestamp } }));
vi.mock("@/lib/firebase-admin", () => ({ adminDb: { collection: vi.fn(() => ({ doc: vi.fn(() => ({ get, update })) })) } }));

import { linkKaneoTaskToProveItTask } from "@/lib/kaneo-task-mapping";

describe("Kaneo task mapping", () => {
  beforeEach(() => { vi.clearAllMocks(); update.mockResolvedValue(undefined); });

  it("stores only server-returned Kaneo identity at the ProveIt task integration path", async () => {
    get.mockResolvedValue({ exists: true, data: () => ({ workspaceId: "business", createdBy: "user-1" }) });
    await linkKaneoTaskToProveItTask("proveit-task-1", "user-1", { taskId: "kaneo-task-1", projectId: "business-project" });
    expect(update).toHaveBeenCalledWith({ "integration.kaneo": { taskId: "kaneo-task-1", projectId: "business-project", syncState: "synced", syncedAt: "timestamp", lastSyncAt: "timestamp" } });
  });

  it.each([
    ["missing ProveIt task", { exists: false, data: () => undefined }, 404],
    ["wrong workspace", { exists: true, data: () => ({ workspaceId: "technology", createdBy: "user-1" }) }, 403],
    ["wrong creator", { exists: true, data: () => ({ workspaceId: "business", createdBy: "another-user" }) }, 403],
    ["existing mapping", { exists: true, data: () => ({ workspaceId: "business", createdBy: "user-1", integration: { kaneo: { taskId: "existing" } } }) }, 409],
  ])("does not create a fake mapping for %s", async (_name, snapshot, status) => {
    get.mockResolvedValue(snapshot);
    await expect(linkKaneoTaskToProveItTask("proveit-task-1", "user-1", { taskId: "kaneo-task-1", projectId: "business-project" })).rejects.toMatchObject({ status });
    expect(update).not.toHaveBeenCalled();
  });

  it("does not retry a mapping write after a failed create/mapping outcome", async () => {
    get.mockResolvedValue({ exists: true, data: () => ({ workspaceId: "business", createdBy: "user-1" }) });
    update.mockRejectedValueOnce(new Error("unavailable"));
    await expect(linkKaneoTaskToProveItTask("proveit-task-1", "user-1", { taskId: "kaneo-task-1", projectId: "business-project" })).rejects.toThrow("unavailable");
    expect(update).toHaveBeenCalledTimes(1);
  });
});
