import { beforeEach, describe, expect, it, vi } from "vitest";

const { get, transactionGet, transactionUpdate, runTransaction, serverTimestamp } = vi.hoisted(() => ({
  get: vi.fn(), transactionGet: vi.fn(), transactionUpdate: vi.fn(), runTransaction: vi.fn(), serverTimestamp: vi.fn(() => "timestamp"),
}));
const { getKaneoTasks } = vi.hoisted(() => ({ getKaneoTasks: vi.fn() }));

vi.mock("firebase-admin/firestore", () => ({ FieldValue: { serverTimestamp } }));
vi.mock("@/lib/firebase-admin", () => ({ adminDb: { collection: vi.fn(() => ({ doc: vi.fn(() => ({ get })) })), runTransaction } }));
vi.mock("@/lib/kaneo", () => ({ getKaneoTasks }));

import {
  attachUniqueReconciledKaneoTask,
  inspectAmbiguousKaneoTask,
  permitKaneoTaskRetryAfterNoMatch,
} from "@/lib/kaneo-task-reconciliation";
import { kaneoCreationFingerprint } from "@/lib/kaneo-task-mapping";

const config = { baseUrl: "http://kaneo.test", apiToken: "test", workspaceId: "workspace", projects: { business: "business-project", technology: "technology-project" } };
const fingerprint = kaneoCreationFingerprint({ title: "Launch", description: "Plan", priority: "high" });
const ambiguousTask = {
  workspaceId: "business",
  integration: { kaneo: { projectId: "business-project", syncState: "ambiguous", creationFingerprint: fingerprint } },
};

describe("Kaneo ambiguous-create reconciliation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    get.mockResolvedValue({ exists: true, data: () => ambiguousTask });
    runTransaction.mockImplementation(async (work) => work({ get: transactionGet, update: transactionUpdate }));
    transactionGet.mockResolvedValue({ exists: true, data: () => ambiguousTask });
  });

  it("finds only exact server-recorded Business creation fingerprints", async () => {
    getKaneoTasks.mockResolvedValue([
      { id: "match", title: "Launch", description: "Plan", priority: "high", status: "to-do" },
      { id: "different", title: "Launch", description: "Changed", priority: "high", status: "to-do" },
    ]);
    await expect(inspectAmbiguousKaneoTask("proveit-task", "business", config)).resolves.toEqual({ projectId: "business-project", matchingTaskIds: ["match"] });
    expect(getKaneoTasks).toHaveBeenCalledWith("business-project", { config });
  });

  it("does not claim a mapping when no exact match or multiple matches exist", async () => {
    getKaneoTasks.mockResolvedValue([]);
    expect((await inspectAmbiguousKaneoTask("proveit-task", "business", config)).matchingTaskIds).toEqual([]);
    getKaneoTasks.mockResolvedValue([
      { id: "one", title: "Launch", description: "Plan", priority: "high", status: "to-do" },
      { id: "two", title: "Launch", description: "Plan", priority: "high", status: "to-do" },
    ]);
    expect((await inspectAmbiguousKaneoTask("proveit-task", "business", config)).matchingTaskIds).toEqual(["one", "two"]);
  });

  it("attaches only a previously unique remote task to the existing task mapping", async () => {
    await attachUniqueReconciledKaneoTask("proveit-task", "business", "business-project", "kaneo-task");
    expect(transactionUpdate).toHaveBeenCalledWith(expect.anything(), {
      "integration.kaneo.taskId": "kaneo-task",
      "integration.kaneo.syncState": "synced",
      "integration.kaneo.reconciledAt": "timestamp",
      "integration.kaneo.syncedAt": "timestamp",
      "integration.kaneo.lastSyncAt": "timestamp",
    });
  });

  it("permits no retry until a BOD-confirmed zero-match outcome is recorded", async () => {
    await permitKaneoTaskRetryAfterNoMatch("proveit-task", "business", "business-project");
    expect(transactionUpdate).toHaveBeenCalledWith(expect.anything(), {
      "integration.kaneo.syncState": "retry_permitted",
      "integration.kaneo.reconciledAt": "timestamp",
      "integration.kaneo.lastSyncAt": "timestamp",
    });
  });

  it("uses the Technology project only when reconciling a Technology task", async () => {
    const technologyConfig = { ...config, projects: { business: "business-project", technology: "technology-project" } };
    const technologyFingerprint = kaneoCreationFingerprint({ title: "Launch", description: "Plan", priority: "high" });
    get.mockResolvedValue({ exists: true, data: () => ({ workspaceId: "technology", integration: { kaneo: { projectId: "technology-project", syncState: "ambiguous", creationFingerprint: technologyFingerprint } } }) });
    getKaneoTasks.mockResolvedValue([{ id: "technology-match", title: "Launch", description: "Plan", priority: "high", status: "to-do" }]);
    await expect(inspectAmbiguousKaneoTask("proveit-task", "technology", technologyConfig)).resolves.toEqual({ projectId: "technology-project", matchingTaskIds: ["technology-match"] });
    expect(getKaneoTasks).toHaveBeenCalledWith("technology-project", { config: technologyConfig });
  });
});
