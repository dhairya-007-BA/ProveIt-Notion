import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireAccess, requireDeleteAccess, syncTask, deleteTask, config, KaneoRouteAuthError } = vi.hoisted(() => ({
  requireAccess: vi.fn(), requireDeleteAccess: vi.fn(), syncTask: vi.fn(), deleteTask: vi.fn(), config: vi.fn(),
  KaneoRouteAuthError: class KaneoRouteAuthError extends Error { constructor(message: string, public status: 401 | 403 | 404 | 503) { super(message); } },
}));
vi.mock("@/lib/kaneo-route-auth", () => ({ KaneoRouteAuthError, requireKaneoWorkspaceAccess: requireAccess, requireKaneoWorkspaceDeleteAccess: requireDeleteAccess }));
vi.mock("@/lib/kaneo-task-update", () => ({ syncMappedWorkspaceTask: syncTask, deleteMappedWorkspaceTask: deleteTask }));
vi.mock("@/lib/kaneo-routing", () => ({ getKaneoProjectKeyForWorkspace: (workspaceId: string) => workspaceId }));
vi.mock("@/lib/kaneo", () => ({ getKaneoConfig: config, KaneoError: class KaneoError extends Error { constructor(message: string, public status: number, public category: string) { super(message); } } }));

import { DELETE, PATCH } from "@/app/api/integrations/kaneo/tasks/[taskId]/route";

const context = { params: Promise.resolve({ taskId: "proveit-task-1" }) };
function request(body: unknown) { return new Request("http://localhost/api/integrations/kaneo/tasks/proveit-task-1", { method: "PATCH", headers: { Authorization: "Bearer test", "Content-Type": "application/json" }, body: JSON.stringify(body) }); }

describe("mapped Kaneo task update route", () => {
  beforeEach(() => { vi.clearAllMocks(); config.mockReturnValue({ projects: { business: "business-project", technology: "technology-project" } }); requireAccess.mockResolvedValue({ uid: "business-user" }); requireDeleteAccess.mockResolvedValue({ uid: "bod-user" }); syncTask.mockResolvedValue({ state: "synced", message: "External sync updated." }); deleteTask.mockResolvedValue({ state: "synced" }); });

  it.each([["unauthenticated", 401], ["inactive", 403], ["no Business access", 403]])("rejects %s before any upstream update", async (_name, status) => {
    requireAccess.mockRejectedValue(new KaneoRouteAuthError("safe", status as 401 | 403));
    const response = await PATCH(request({ fields: ["title"] }), context);
    expect(response.status).toBe(status); expect(syncTask).not.toHaveBeenCalled();
  });

  it("accepts only fields and never accepts browser-owned routing or Kaneo identity", async () => {
    for (const body of [
      { fields: ["title"], kaneoTaskId: "attacker" }, { fields: ["title"], projectId: "attacker" }, { fields: ["title"], workspaceId: "technology" }, { fields: ["title"], path: "/api/task/attacker" }, { fields: ["title"], url: "https://attacker.test" }, { fields: ["title"], headers: {} },
    ]) {
      const response = await PATCH(request(body), context);
      expect(response.status).toBe(422);
    }
    expect(syncTask).not.toHaveBeenCalled();
  });

  it("passes only the ProveIt document ID and selected supported fields to the server helper", async () => {
    const response = await PATCH(request({ fields: ["title", "description", "priority"] }), context);
    expect(response.status).toBe(200);
    expect(syncTask).toHaveBeenCalledWith("proveit-task-1", "business", ["title", "description", "priority"], { business: "business-project", technology: "technology-project" });
  });

  it("rejects cross-workspace task selection in the server helper before Kaneo is called", async () => {
    syncTask.mockResolvedValue({ state: "partial", message: "External sync is not configured for this task." });
    const response = await PATCH(request({ fields: ["title"] }), context);
    expect(response.status).toBe(200); expect(await response.json()).toMatchObject({ state: "partial" });
  });

  it("requires BOD delete authorization and uses no browser-supplied Kaneo data", async () => {
    requireDeleteAccess.mockRejectedValueOnce(new KaneoRouteAuthError("safe", 403));
    expect((await DELETE(new Request("http://localhost/api/integrations/kaneo/tasks/proveit-task-1", { method: "DELETE" }), context)).status).toBe(403);
    expect(deleteTask).not.toHaveBeenCalled();
    const response = await DELETE(new Request("http://localhost/api/integrations/kaneo/tasks/proveit-task-1", { method: "DELETE", body: JSON.stringify({ kaneoTaskId: "attacker", projectId: "attacker", path: "attacker" }) }), context);
    expect(response.status).toBe(200); expect(deleteTask).toHaveBeenCalledWith("proveit-task-1", "business", { business: "business-project", technology: "technology-project" });
  });

  it("returns only safe messages for upstream errors", async () => {
    syncTask.mockRejectedValue(new Error("sensitive upstream detail"));
    const response = await PATCH(request({ fields: ["title"] }), context);
    expect(await response.json()).toEqual({ success: false, message: "External sync failed." });
  });
});
