import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  requireKaneoWorkspaceAccess,
  createKaneoWorkspaceTask,
  KaneoRouteAuthError,
  KaneoError,
  KaneoTaskCreateError,
  KaneoRoutingError,
  reserveKaneoTaskCreation,
  markKaneoTaskCreationOutcome,
  linkKaneoTaskToProveItTask,
  getKaneoConfig,
  getKaneoProjectIdForWorkspace,
  getKaneoProjectKeyForWorkspace,
} = vi.hoisted(() => ({
  requireKaneoWorkspaceAccess: vi.fn(),
  createKaneoWorkspaceTask: vi.fn(),
  KaneoRouteAuthError: class KaneoRouteAuthError extends Error {
    constructor(message: string, public status: 401 | 403 | 404 | 503) { super(message); }
  },
  KaneoError: class KaneoError extends Error {
    constructor(message: string, public status: 502 | 503, public category: string) { super(message); }
  },
  KaneoTaskCreateError: class KaneoTaskCreateError extends Error {
    constructor(message: string, public status: 422 | 502 | 503) { super(message); }
  },
  KaneoRoutingError: class KaneoRoutingError extends Error {},
  reserveKaneoTaskCreation: vi.fn(),
  markKaneoTaskCreationOutcome: vi.fn(),
  linkKaneoTaskToProveItTask: vi.fn(),
  getKaneoConfig: vi.fn(),
  getKaneoProjectIdForWorkspace: vi.fn(),
  getKaneoProjectKeyForWorkspace: vi.fn(),
}));

vi.mock("@/lib/kaneo-route-auth", () => ({ KaneoRouteAuthError, requireKaneoWorkspaceAccess }));
vi.mock("@/lib/kaneo-task-create", () => ({ KaneoTaskCreateError, createKaneoWorkspaceTask }));
vi.mock("@/lib/kaneo-routing", () => ({ KaneoRoutingError, getKaneoProjectIdForWorkspace, getKaneoProjectKeyForWorkspace }));
vi.mock("@/lib/kaneo", () => ({ KaneoError, getKaneoConfig, getKaneoTasks: vi.fn() }));
vi.mock("@/lib/kaneo-task-mapping", () => ({
  KaneoTaskMappingError: class KaneoTaskMappingError extends Error { constructor(message: string, public status: number) { super(message); } },
  reserveKaneoTaskCreation,
  markKaneoTaskCreationOutcome,
  linkKaneoTaskToProveItTask,
}));

import { POST } from "@/app/api/integrations/kaneo/tasks/route";

function request(body: unknown = { proveItTaskId: "proveit-task-1", title: "Launch plan", priority: "high" }) {
  return new Request("http://localhost/api/integrations/kaneo/tasks", {
    method: "POST",
    headers: { Authorization: "Bearer test-token", "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("production Business Kaneo task route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireKaneoWorkspaceAccess.mockResolvedValue({ uid: "business-user", profile: {} });
    reserveKaneoTaskCreation.mockResolvedValue(undefined);
    markKaneoTaskCreationOutcome.mockResolvedValue(undefined);
    linkKaneoTaskToProveItTask.mockResolvedValue(undefined);
    getKaneoConfig.mockReturnValue({ projects: { business: "business-project", technology: "technology-project" } });
    getKaneoProjectIdForWorkspace.mockReturnValue("business-project");
    getKaneoProjectKeyForWorkspace.mockImplementation((workspaceId: string) => workspaceId);
    createKaneoWorkspaceTask.mockResolvedValue({
      id: "kaneo-task-1", projectId: "business-project", title: "Launch plan", status: "to-do", priority: "high",
    });
  });

  it.each([
    ["missing authentication", new KaneoRouteAuthError("Authentication required.", 401)],
    ["invalid authentication", new KaneoRouteAuthError("Invalid or expired authentication.", 401)],
    ["inactive user", new KaneoRouteAuthError("Active employee account required.", 403)],
    ["unauthorized Business user", new KaneoRouteAuthError("Workspace access required.", 403)],
  ])("rejects %s without creating a Kaneo task", async (_name, error) => {
    requireKaneoWorkspaceAccess.mockRejectedValue(error);
    const response = await POST(request());
    expect(response.status).toBe(error.status);
    expect(createKaneoWorkspaceTask).not.toHaveBeenCalled();
  });

  it.each([
    ["malformed JSON", "{"],
    ["unexpected fields", { title: "Launch plan", projectId: "attacker-project" }],
    ["missing task ID", { title: "Launch plan", priority: "high" }],
    ["missing title", { proveItTaskId: "proveit-task-1", priority: "high" }],
    ["invalid priority", { title: "Launch plan", priority: "critical" }],
  ])("rejects %s before authorization or creation", async (_name, body) => {
    const response = await POST(typeof body === "string"
      ? new Request("http://localhost/api/integrations/kaneo/tasks", { method: "POST", body })
      : request(body));
    expect(response.status).toBe(422);
    expect(requireKaneoWorkspaceAccess).not.toHaveBeenCalled();
    expect(createKaneoWorkspaceTask).not.toHaveBeenCalled();
  });

  it("uses only the normalized Business task body and returns a safe response", async () => {
    const response = await POST(request({ proveItTaskId: "proveit-task-1", title: "  Launch plan  ", description: "  Coordinate launch work.  ", priority: "high" }));
    expect(createKaneoWorkspaceTask).toHaveBeenCalledWith("business", {
      proveItTaskId: "proveit-task-1", title: "Launch plan", description: "Coordinate launch work.", priority: "high",
    }, expect.anything());
    expect(reserveKaneoTaskCreation).toHaveBeenCalledWith("proveit-task-1", "business-user", "business", "business-project", {
      proveItTaskId: "proveit-task-1", title: "Launch plan", description: "Coordinate launch work.", priority: "high",
    }, false);
    expect(linkKaneoTaskToProveItTask).toHaveBeenCalledWith("proveit-task-1", "business-user", "business", { taskId: "kaneo-task-1", projectId: "business-project" });
    expect(await response.json()).toEqual({
      success: true,
      httpStatus: 200,
      kaneoTaskId: "kaneo-task-1",
      projectId: "business-project",
      title: "Launch plan",
      status: "to-do",
      priority: "high",
      message: "Kaneo task created.",
    });
  });

  it.each([
    ["immutable routing", new KaneoRoutingError("must-not-return"), 422, "Workspace routing is unavailable."],
    ["missing to-do", new KaneoTaskCreateError("The mapped Kaneo project does not expose the required to-do status.", 422), 422, "The mapped Kaneo project does not expose the required to-do status."],
    ["upstream 4xx", new KaneoError("Kaneo service could not complete the request.", 502, "upstream_4xx"), 502, "Kaneo service could not complete the request."],
    ["upstream 5xx", new KaneoError("Kaneo service could not complete the request.", 503, "upstream_5xx"), 503, "Kaneo service could not complete the request."],
    ["malformed response", new KaneoTaskCreateError("Kaneo returned an invalid response.", 502), 502, "Kaneo returned an invalid response."],
  ])("returns a safe %s response", async (_name, error, status, message) => {
    createKaneoWorkspaceTask.mockRejectedValue(error);
    const response = await POST(request());
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ success: false, httpStatus: status, message });
  });

  it("returns an ambiguous timeout result and does not retry", async () => {
    createKaneoWorkspaceTask.mockRejectedValue(new KaneoError("must-not-return", 503, "timeout"));
    const response = await POST(request());
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      success: false,
      httpStatus: 503,
      message: "Kaneo task creation outcome is ambiguous and will not be retried automatically.",
    });
    expect(createKaneoWorkspaceTask).toHaveBeenCalledTimes(1);
    expect(markKaneoTaskCreationOutcome).toHaveBeenCalledWith("proveit-task-1", "business-user", "business", "business-project", "ambiguous");
  });

  it("fails closed before an upstream create when the task already has an integration attempt", async () => {
    const { KaneoTaskMappingError } = await import("@/lib/kaneo-task-mapping");
    reserveKaneoTaskCreation.mockRejectedValue(new KaneoTaskMappingError("This ProveIt task already has a Kaneo synchronization attempt.", 409));
    const response = await POST(request());
    expect(response.status).toBe(409);
    expect(createKaneoWorkspaceTask).not.toHaveBeenCalled();
  });

  it("passes BOD-only retry authority to the task-level idempotency boundary", async () => {
    requireKaneoWorkspaceAccess.mockResolvedValue({ uid: "bod-user", profile: { role: "bod" } });
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(reserveKaneoTaskCreation).toHaveBeenCalledWith("proveit-task-1", "bod-user", "business", "business-project", {
      proveItTaskId: "proveit-task-1", title: "Launch plan", priority: "high",
    }, true);
  });

  it("routes a Technology create only to the immutable Technology project", async () => {
    getKaneoProjectIdForWorkspace.mockImplementation((workspaceId: string) => workspaceId === "technology" ? "technology-project" : "business-project");
    createKaneoWorkspaceTask.mockResolvedValue({ id: "technology-task", projectId: "technology-project", title: "Launch plan", status: "to-do", priority: "high" });
    const response = await POST(new Request("http://localhost/api/integrations/kaneo/tasks?workspaceId=technology", { method: "POST", headers: { Authorization: "Bearer test-token", "Content-Type": "application/json" }, body: JSON.stringify({ proveItTaskId: "proveit-task-1", title: "Launch plan", priority: "high" }) }));
    expect(response.status).toBe(200);
    expect(requireKaneoWorkspaceAccess).toHaveBeenCalledWith(expect.any(Request), "technology");
    expect(reserveKaneoTaskCreation).toHaveBeenCalledWith("proveit-task-1", "business-user", "technology", "technology-project", expect.anything(), false);
    expect(createKaneoWorkspaceTask).toHaveBeenCalledWith("technology", expect.anything(), expect.anything());
    expect(linkKaneoTaskToProveItTask).toHaveBeenCalledWith("proveit-task-1", "business-user", "technology", { taskId: "technology-task", projectId: "technology-project" });
  });

  it.each(["company", "board"]) ("rejects %s mutation routing before an upstream create", async (workspaceId) => {
    getKaneoProjectKeyForWorkspace.mockImplementationOnce(() => { throw new KaneoRoutingError("This workspace is not mapped to a Kaneo project."); });
    const response = await POST(new Request(`http://localhost/api/integrations/kaneo/tasks?workspaceId=${workspaceId}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ proveItTaskId: "proveit-task-1", title: "Launch plan" }) }));
    expect(response.status).toBe(422);
    expect(createKaneoWorkspaceTask).not.toHaveBeenCalled();
  });
});
