import { beforeEach, describe, expect, it, vi } from "vitest";

const { get, update, kaneoPut, kaneoDelete, project } = vi.hoisted(() => ({
  get: vi.fn(), update: vi.fn(), kaneoPut: vi.fn(), kaneoDelete: vi.fn(), project: vi.fn(),
}));

vi.mock("firebase-admin/firestore", () => ({ FieldValue: { serverTimestamp: vi.fn(() => "timestamp") } }));
vi.mock("@/lib/firebase-admin", () => ({ adminDb: { collection: vi.fn(() => ({ doc: vi.fn(() => ({ get, update })) })) } }));
vi.mock("@/lib/kaneo", () => ({
  kaneoPut, kaneoDelete,
  KaneoError: class KaneoError extends Error { constructor(message: string, public status: number, public category: string) { super(message); } },
}));
vi.mock("@/lib/kaneo-routing", () => ({ getKaneoProjectIdForWorkspace: project }));

import { KaneoError } from "@/lib/kaneo";
import { deleteMappedBusinessTask, syncMappedBusinessTask } from "@/lib/kaneo-task-update";

const projects = { business: "business-project", technology: "technology-project" };
const mappedTask = (overrides: Record<string, unknown> = {}) => ({ workspaceId: "business", title: "Plan", description: "Details", priority: "high", status: "todo", integration: { kaneo: { taskId: "kaneo-task-1", projectId: "business-project" } }, ...overrides });

describe("mapped Business Kaneo updates", () => {
  beforeEach(() => { vi.clearAllMocks(); project.mockReturnValue("business-project"); get.mockResolvedValue({ exists: true, data: () => mappedTask() }); kaneoPut.mockResolvedValue({ id: "kaneo-task-1" }); kaneoDelete.mockResolvedValue({ id: "kaneo-task-1" }); update.mockResolvedValue(undefined); });

  it.each([
    ["title", "/api/task/title/kaneo-task-1", { title: "Plan" }],
    ["description", "/api/task/description/kaneo-task-1", { description: "Details" }],
    ["priority", "/api/task/priority/kaneo-task-1", { priority: "high" }],
    ["status", "/api/task/status/kaneo-task-1", { status: "to-do" }],
  ])("sends only the changed %s through its mapped Kaneo task ID", async (field, path, body) => {
    await expect(syncMappedBusinessTask("proveit-task-1", [field], projects)).resolves.toMatchObject({ state: "synced" });
    expect(kaneoPut).toHaveBeenCalledTimes(1);
    expect(kaneoPut).toHaveBeenCalledWith(path, body);
  });

  it.each([["in_progress", "in-progress"], ["done", "done"]])("maps %s status safely", async (status, expected) => {
    get.mockResolvedValue({ exists: true, data: () => mappedTask({ status }) });
    await syncMappedBusinessTask("proveit-task-1", ["status"], projects);
    expect(kaneoPut).toHaveBeenCalledWith("/api/task/status/kaneo-task-1", { status: expected });
  });

  it("does not send blocked status and records partial sync", async () => {
    get.mockResolvedValue({ exists: true, data: () => mappedTask({ status: "blocked" }) });
    await expect(syncMappedBusinessTask("proveit-task-1", ["status"], projects)).resolves.toMatchObject({ state: "partial" });
    expect(kaneoPut).not.toHaveBeenCalled();
  });

  it("synchronizes only explicitly changed supported fields", async () => {
    await syncMappedBusinessTask("proveit-task-1", ["title", "description", "priority"], projects);
    expect(kaneoPut.mock.calls.map(([path]) => path)).toEqual(["/api/task/title/kaneo-task-1", "/api/task/description/kaneo-task-1", "/api/task/priority/kaneo-task-1"]);
  });

  it("isolates non-Business and unmapped tasks without Kaneo requests", async () => {
    get.mockResolvedValueOnce({ exists: true, data: () => mappedTask({ workspaceId: "technology" }) });
    await expect(syncMappedBusinessTask("technology-task", ["title"], projects)).resolves.toMatchObject({ state: "partial" });
    get.mockResolvedValueOnce({ exists: true, data: () => mappedTask({ integration: {} }) });
    await expect(deleteMappedBusinessTask("unmapped-business", projects)).resolves.toMatchObject({ state: "partial" });
    expect(kaneoPut).not.toHaveBeenCalled(); expect(kaneoDelete).not.toHaveBeenCalled();
  });

  it("classifies definite failure and network ambiguity without retrying", async () => {
    kaneoPut.mockRejectedValueOnce(new KaneoError("hidden", 502, "upstream_4xx"));
    await expect(syncMappedBusinessTask("proveit-task-1", ["title"], projects)).resolves.toMatchObject({ state: "failed", message: "External sync failed." });
    expect(kaneoPut).toHaveBeenCalledTimes(1);
    kaneoPut.mockClear();
    kaneoPut.mockRejectedValueOnce(new KaneoError("hidden", 503, "timeout"));
    await expect(syncMappedBusinessTask("proveit-task-1", ["title"], projects)).resolves.toMatchObject({ state: "ambiguous", message: "External sync could not be confirmed." });
    expect(kaneoPut).toHaveBeenCalledTimes(1);
  });

  it("deletes exactly the server-mapped Kaneo task once", async () => {
    await expect(deleteMappedBusinessTask("proveit-task-1", projects)).resolves.toEqual({ state: "synced" });
    expect(kaneoDelete).toHaveBeenCalledTimes(1);
    expect(kaneoDelete).toHaveBeenCalledWith("/api/task/kaneo-task-1");
  });
});
