import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  requireKaneoUser,
  requireKaneoWorkspaceAccess,
  kaneoGet,
  getKaneoConfig,
  getKaneoProject,
  getKaneoTasks,
  getKaneoColumns,
  kaneoPost,
} = vi.hoisted(() => ({
  requireKaneoUser: vi.fn(),
  requireKaneoWorkspaceAccess: vi.fn(),
  kaneoGet: vi.fn(),
  getKaneoConfig: vi.fn(),
  getKaneoProject: vi.fn(),
  getKaneoTasks: vi.fn(),
  getKaneoColumns: vi.fn(),
  kaneoPost: vi.fn(),
}));

vi.mock("@/lib/kaneo-route-auth", () => ({
  KaneoRouteAuthError: class KaneoRouteAuthError extends Error { status = 401; },
  requireKaneoUser,
  requireKaneoWorkspaceAccess,
}));
vi.mock("@/lib/kaneo", () => ({
  KaneoError: class KaneoError extends Error { constructor(message: string, public status: number) { super(message); } },
  kaneoGet,
  getKaneoConfig,
  getKaneoProject,
  getKaneoTasks,
  getKaneoColumns,
  kaneoPost,
}));

import { GET as health } from "@/app/api/integrations/kaneo/health/route";
import { GET as projects } from "@/app/api/integrations/kaneo/projects/route";
import { GET as tasks } from "@/app/api/integrations/kaneo/tasks/route";

describe("Kaneo read-only routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireKaneoUser.mockResolvedValue({ uid: "user-1" });
    requireKaneoWorkspaceAccess.mockResolvedValue({ uid: "user-1" });
    getKaneoConfig.mockReturnValue({ projects: { business: "business-project", technology: "technology-project" } });
    kaneoGet.mockResolvedValue({ status: "ok" });
    getKaneoProject.mockResolvedValue({ id: "business-project", workspaceId: "kaneo-workspace", name: "Operations", slug: "operations", icon: null, description: null, archivedAt: null });
    getKaneoTasks.mockResolvedValue([{ id: "task-1", title: "Read only", description: null, status: "to-do", priority: "medium", dueDate: null, assigneeId: null }]);
  });

  it("returns a constrained health response", async () => {
    const response = await health(new Request("http://localhost/api/integrations/kaneo/health", { headers: { Authorization: "Bearer token" } }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, status: "ok" });
  });

  it("rejects an unmapped workspace without an upstream request", async () => {
    const response = await projects(new Request("http://localhost/api/integrations/kaneo/projects?workspaceId=company"));
    expect(response.status).toBe(422);
    expect(getKaneoProject).not.toHaveBeenCalled();
  });

  it("returns only the mapped project for an authorized workspace", async () => {
    const response = await projects(new Request("http://localhost/api/integrations/kaneo/projects?workspaceId=business"));
    expect(response.status).toBe(200);
    expect(getKaneoProject).toHaveBeenCalledWith("business-project", expect.any(Object));
  });

  it("returns normalized tasks for an authorized mapped workspace", async () => {
    const response = await tasks(new Request("http://localhost/api/integrations/kaneo/tasks?workspaceId=technology"));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ success: true, projectId: "technology-project", tasks: [{ id: "task-1" }] });
  });
});
