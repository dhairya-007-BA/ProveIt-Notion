import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  requireKaneoWorkspaceAccess,
  createKaneoBusinessTask,
  KaneoRouteAuthError,
  KaneoError,
  KaneoTaskCreateError,
  KaneoRoutingError,
} = vi.hoisted(() => ({
  requireKaneoWorkspaceAccess: vi.fn(),
  createKaneoBusinessTask: vi.fn(),
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
}));

vi.mock("@/lib/kaneo-route-auth", () => ({ KaneoRouteAuthError, requireKaneoWorkspaceAccess }));
vi.mock("@/lib/kaneo-task-create", () => ({ KaneoTaskCreateError, createKaneoBusinessTask }));
vi.mock("@/lib/kaneo-routing", () => ({ KaneoRoutingError, getKaneoProjectIdForWorkspace: vi.fn() }));
vi.mock("@/lib/kaneo", () => ({ KaneoError, getKaneoConfig: vi.fn(), getKaneoTasks: vi.fn() }));

import { POST } from "@/app/api/integrations/kaneo/tasks/route";

function request(body: unknown = { title: "Launch plan", priority: "high" }) {
  return new Request("http://localhost/api/integrations/kaneo/tasks", {
    method: "POST",
    headers: { Authorization: "Bearer test-token", "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("production Business Kaneo task route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireKaneoWorkspaceAccess.mockResolvedValue({ uid: "business-user" });
    createKaneoBusinessTask.mockResolvedValue({
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
    expect(createKaneoBusinessTask).not.toHaveBeenCalled();
  });

  it.each([
    ["malformed JSON", "{"],
    ["unexpected fields", { title: "Launch plan", projectId: "attacker-project" }],
    ["missing title", { priority: "high" }],
    ["invalid priority", { title: "Launch plan", priority: "critical" }],
  ])("rejects %s before authorization or creation", async (_name, body) => {
    const response = await POST(typeof body === "string"
      ? new Request("http://localhost/api/integrations/kaneo/tasks", { method: "POST", body })
      : request(body));
    expect(response.status).toBe(422);
    expect(requireKaneoWorkspaceAccess).not.toHaveBeenCalled();
    expect(createKaneoBusinessTask).not.toHaveBeenCalled();
  });

  it("uses only the normalized Business task body and returns a safe response", async () => {
    const response = await POST(request({ title: "  Launch plan  ", description: "  Coordinate launch work.  ", priority: "high" }));
    expect(createKaneoBusinessTask).toHaveBeenCalledWith({
      title: "Launch plan", description: "Coordinate launch work.", priority: "high",
    });
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
    ["immutable routing", new KaneoRoutingError("must-not-return"), 422, "Business workspace routing is unavailable."],
    ["missing to-do", new KaneoTaskCreateError("The mapped Kaneo project does not expose the required to-do status.", 422), 422, "The mapped Kaneo project does not expose the required to-do status."],
    ["upstream 4xx", new KaneoError("Kaneo service could not complete the request.", 502, "upstream_4xx"), 502, "Kaneo service could not complete the request."],
    ["upstream 5xx", new KaneoError("Kaneo service could not complete the request.", 503, "upstream_5xx"), 503, "Kaneo service could not complete the request."],
    ["malformed response", new KaneoTaskCreateError("Kaneo returned an invalid response.", 502), 502, "Kaneo returned an invalid response."],
  ])("returns a safe %s response", async (_name, error, status, message) => {
    createKaneoBusinessTask.mockRejectedValue(error);
    const response = await POST(request());
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ success: false, httpStatus: status, message });
  });

  it("returns an ambiguous timeout result and does not retry", async () => {
    createKaneoBusinessTask.mockRejectedValue(new KaneoError("must-not-return", 503, "timeout"));
    const response = await POST(request());
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      success: false,
      httpStatus: 503,
      message: "Kaneo task creation outcome is ambiguous and will not be retried automatically.",
    });
    expect(createKaneoBusinessTask).toHaveBeenCalledTimes(1);
  });
});
