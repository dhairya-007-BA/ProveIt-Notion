import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  requireKaneoWorkspaceAccess,
  getKaneoConfig,
  getKaneoColumns,
  getKaneoProjectIdForWorkspace,
  kaneoPost,
  KaneoRouteAuthError,
  KaneoError,
  KaneoRoutingError,
} = vi.hoisted(() => ({
  requireKaneoWorkspaceAccess: vi.fn(),
  getKaneoConfig: vi.fn(),
  getKaneoColumns: vi.fn(),
  getKaneoProjectIdForWorkspace: vi.fn(),
  kaneoPost: vi.fn(),
  KaneoRouteAuthError: class KaneoRouteAuthError extends Error {
    constructor(message: string, public status: number) { super(message); }
  },
  KaneoError: class KaneoError extends Error {
    constructor(message: string, public status: number, public category: string) { super(message); }
  },
  KaneoRoutingError: class KaneoRoutingError extends Error {},
}));

vi.mock("@/lib/kaneo-route-auth", () => ({ KaneoRouteAuthError, requireKaneoWorkspaceAccess }));
vi.mock("@/lib/kaneo", () => ({ KaneoError, getKaneoConfig, getKaneoColumns, kaneoPost }));
vi.mock("@/lib/kaneo-routing", () => ({ KaneoRoutingError, getKaneoProjectIdForWorkspace }));

import { GET } from "@/app/api/integrations/kaneo/columns/route";

const config = {
  projects: { business: "business-project", technology: "technology-project" },
};

function request(workspaceId?: string, authenticated = true) {
  const query = workspaceId ? `?workspaceId=${workspaceId}` : "";
  return new Request(`http://localhost/api/integrations/kaneo/columns${query}`, {
    headers: authenticated ? { Authorization: "Bearer test-token" } : undefined,
  });
}

describe("Kaneo read-only columns route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireKaneoWorkspaceAccess.mockResolvedValue({ uid: "user-1" });
    getKaneoConfig.mockReturnValue(config);
    getKaneoProjectIdForWorkspace.mockImplementation((workspaceId: string) => {
      if (workspaceId === "business") return "business-project";
      if (workspaceId === "technology") return "technology-project";
      throw new KaneoRoutingError("This workspace is not mapped to a Kaneo project.");
    });
    getKaneoColumns.mockResolvedValue([
      { id: "column-1", projectId: "business-project", name: "To Do", slug: "to-do", position: 0, isFinal: false },
      { id: "column-2", projectId: "business-project", name: "Done", slug: "done", position: 1, isFinal: true },
    ]);
  });

  it("requires authentication", async () => {
    requireKaneoWorkspaceAccess.mockRejectedValue(new KaneoRouteAuthError("Authentication required.", 401));
    const response = await GET(request("business", false));
    expect(response.status).toBe(401);
    expect(getKaneoColumns).not.toHaveBeenCalled();
    expect(kaneoPost).not.toHaveBeenCalled();
  });

  it.each([
    ["invalid authentication", new KaneoRouteAuthError("Invalid or expired authentication.", 401)],
    ["inactive user", new KaneoRouteAuthError("Active employee account required.", 403)],
    ["unauthorized workspace user", new KaneoRouteAuthError("Workspace access required.", 403)],
  ])("rejects %s", async (_name, error) => {
    requireKaneoWorkspaceAccess.mockRejectedValue(error);
    const response = await GET(request("business"));
    expect(response.status).toBe(error.status);
    expect(getKaneoColumns).not.toHaveBeenCalled();
    expect(kaneoPost).not.toHaveBeenCalled();
  });

  it("requires workspaceId", async () => {
    const response = await GET(request());
    expect(response.status).toBe(422);
    expect(getKaneoColumns).not.toHaveBeenCalled();
    expect(kaneoPost).not.toHaveBeenCalled();
  });

  it.each(["company", "board", "custom"])("fails closed for %s", async (workspaceId) => {
    const response = await GET(request(workspaceId));
    expect(response.status).toBe(422);
    expect(getKaneoColumns).not.toHaveBeenCalled();
    expect(kaneoPost).not.toHaveBeenCalled();
  });

  it("returns only normalized Business columns and detects to-do", async () => {
    const response = await GET(request("business"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      httpStatus: 200,
      projectId: "business-project",
      columns: [
        { name: "To Do", slug: "to-do" },
        { name: "Done", slug: "done" },
      ],
      toDoExists: true,
    });
    expect(getKaneoColumns).toHaveBeenCalledWith("business-project", { config });
    expect(kaneoPost).not.toHaveBeenCalled();
  });

  it("reports false when to-do is absent", async () => {
    getKaneoColumns.mockResolvedValue([
      { id: "column-2", projectId: "business-project", name: "Backlog", slug: "backlog", position: 0, isFinal: false },
    ]);
    const response = await GET(request("business"));
    expect(await response.json()).toMatchObject({ success: true, toDoExists: false });
    expect(kaneoPost).not.toHaveBeenCalled();
  });

  it.each([
    ["malformed response", new KaneoError("Kaneo returned an invalid response.", 502, "malformed_response"), 502, "column_malformed_response"],
    ["upstream 4xx", new KaneoError("Kaneo service could not complete the request.", 502, "upstream_4xx"), 502, "column_upstream_4xx"],
    ["upstream 5xx", new KaneoError("Kaneo service could not complete the request.", 503, "upstream_5xx"), 503, "column_upstream_5xx"],
    ["network", new KaneoError("Kaneo service is unavailable.", 503, "network"), 503, "column_network"],
    ["timeout", new KaneoError("Kaneo service is unavailable.", 503, "timeout"), 503, "column_timeout"],
  ])("normalizes %s without leaking upstream data", async (_name, error, status, diagnosticCategory) => {
    getKaneoColumns.mockRejectedValue(error);
    const response = await GET(request("business"));
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({
      success: false,
      httpStatus: status,
      message: error.message,
      diagnosticCategory,
    });
    expect(kaneoPost).not.toHaveBeenCalled();
  });
});
