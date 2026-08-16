import { beforeEach, describe, expect, it, vi } from "vitest";

const { get, update, transactionGet, transactionUpdate, runTransaction, serverTimestamp, increment } = vi.hoisted(() => ({ get: vi.fn(), update: vi.fn(), transactionGet: vi.fn(), transactionUpdate: vi.fn(), runTransaction: vi.fn(), serverTimestamp: vi.fn(() => "timestamp"), increment: vi.fn(() => "increment") }));
vi.mock("firebase-admin/firestore", () => ({ FieldValue: { serverTimestamp, increment } }));
vi.mock("@/lib/firebase-admin", () => ({ adminDb: { collection: vi.fn(() => ({ doc: vi.fn(() => ({ get, update })) })), runTransaction } }));

import { kaneoCreationFingerprint, linkKaneoTaskToProveItTask, markKaneoTaskCreationOutcome, reserveKaneoTaskCreation } from "@/lib/kaneo-task-mapping";

const input = { title: "Launch", description: "Plan", priority: "high" as const };
const task = { workspaceId: "business", createdBy: "user-1", title: "Launch", description: "Plan", priority: "high" };

describe("Kaneo task mapping", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    update.mockResolvedValue(undefined);
    runTransaction.mockImplementation(async (work) => work({ get: transactionGet, update: transactionUpdate }));
  });

  it("atomically reserves the task's existing integration field before one upstream create", async () => {
    transactionGet.mockResolvedValue({ exists: true, data: () => task });
    await reserveKaneoTaskCreation("proveit-task-1", "user-1", "business", "business-project", input);
    expect(transactionUpdate).toHaveBeenCalledWith(expect.anything(), {
      "integration.kaneo": { projectId: "business-project", syncState: "creating", creationFingerprint: kaneoCreationFingerprint(input), creationAttempt: 1, requestedAt: "timestamp" },
    });
  });

  it("does not allow a normal Business request to consume a BOD-permitted retry", async () => {
    transactionGet.mockResolvedValue({ exists: true, data: () => ({ ...task, integration: { kaneo: { projectId: "business-project", syncState: "retry_permitted", creationFingerprint: kaneoCreationFingerprint(input) } } }) });
    await expect(reserveKaneoTaskCreation("proveit-task-1", "user-1", "business", "business-project", input)).rejects.toMatchObject({ status: 409 });
    expect(transactionUpdate).not.toHaveBeenCalled();
  });

  it("blocks a second create attempt before any Kaneo request can be dispatched", async () => {
    transactionGet.mockResolvedValue({ exists: true, data: () => ({ ...task, integration: { kaneo: { syncState: "creating", projectId: "business-project" } } }) });
    await expect(reserveKaneoTaskCreation("proveit-task-1", "user-1", "business", "business-project", input)).rejects.toMatchObject({ status: 409 });
    expect(transactionUpdate).not.toHaveBeenCalled();
  });

  it.each(["failed", "ambiguous"] as const)("records a safe %s create outcome on the same mapping", async (state) => {
    transactionGet.mockResolvedValue({ exists: true, data: () => ({ ...task, integration: { kaneo: { projectId: "business-project", syncState: "creating" } } }) });
    await markKaneoTaskCreationOutcome("proveit-task-1", "user-1", "business", "business-project", state);
    expect(transactionUpdate).toHaveBeenCalledWith(expect.anything(), {
      "integration.kaneo.syncState": state,
      "integration.kaneo.lastSyncAt": "timestamp",
    });
  });

  it("stores only server-returned Kaneo identity at the ProveIt task integration path", async () => {
    get.mockResolvedValue({ exists: true, data: () => ({ ...task, integration: { kaneo: { projectId: "business-project", syncState: "creating", creationFingerprint: kaneoCreationFingerprint(input), creationAttempt: 1 } } }) });
    await linkKaneoTaskToProveItTask("proveit-task-1", "user-1", "business", { taskId: "kaneo-task-1", projectId: "business-project" });
    expect(update).toHaveBeenCalledWith({ "integration.kaneo": { taskId: "kaneo-task-1", projectId: "business-project", syncState: "synced", creationFingerprint: kaneoCreationFingerprint(input), creationAttempt: 1, syncedAt: "timestamp", lastSyncAt: "timestamp" } });
  });

  it.each([
    ["missing ProveIt task", { exists: false, data: () => undefined }, 404],
    ["wrong workspace", { exists: true, data: () => ({ ...task, workspaceId: "technology" }) }, 403],
    ["wrong creator", { exists: true, data: () => ({ ...task, createdBy: "another-user" }) }, 403],
    ["existing mapping", { exists: true, data: () => ({ ...task, integration: { kaneo: { taskId: "existing" } } }) }, 409],
  ])("does not create a fake mapping for %s", async (_name, snapshot, status) => {
    get.mockResolvedValue(snapshot);
    await expect(linkKaneoTaskToProveItTask("proveit-task-1", "user-1", "business", { taskId: "kaneo-task-1", projectId: "business-project" })).rejects.toMatchObject({ status });
    expect(update).not.toHaveBeenCalled();
  });

  it("does not retry a mapping write after a failed create/mapping outcome", async () => {
    get.mockResolvedValue({ exists: true, data: () => ({ ...task, integration: { kaneo: { projectId: "business-project", syncState: "creating", creationFingerprint: kaneoCreationFingerprint(input) } } }) });
    update.mockRejectedValueOnce(new Error("unavailable"));
    await expect(linkKaneoTaskToProveItTask("proveit-task-1", "user-1", "business", { taskId: "kaneo-task-1", projectId: "business-project" })).rejects.toThrow("unavailable");
    expect(update).toHaveBeenCalledTimes(1);
  });

  it("only consumes an explicitly permitted retry when it matches the original creation fingerprint", async () => {
    transactionGet.mockResolvedValue({ exists: true, data: () => ({ ...task, integration: { kaneo: { projectId: "business-project", syncState: "retry_permitted", creationFingerprint: kaneoCreationFingerprint(input) } } }) });
    await reserveKaneoTaskCreation("proveit-task-1", "user-1", "business", "business-project", input, true);
    expect(transactionUpdate).toHaveBeenCalledWith(expect.anything(), {
      "integration.kaneo.syncState": "creating",
      "integration.kaneo.creationAttempt": "increment",
      "integration.kaneo.requestedAt": "timestamp",
    });
  });

  it("binds a Technology claim to the Technology task and never to Business", async () => {
    const technologyTask = { ...task, workspaceId: "technology" };
    transactionGet.mockResolvedValue({ exists: true, data: () => technologyTask });
    await reserveKaneoTaskCreation("proveit-task-1", "user-1", "technology", "technology-project", input);
    expect(transactionUpdate).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      "integration.kaneo": expect.objectContaining({ projectId: "technology-project" }),
    }));
  });
});
