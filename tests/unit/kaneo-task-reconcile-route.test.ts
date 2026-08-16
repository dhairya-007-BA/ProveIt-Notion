import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireBod, inspect, attach, permit, config, KaneoRouteAuthError } = vi.hoisted(() => ({
  requireBod: vi.fn(), inspect: vi.fn(), attach: vi.fn(), permit: vi.fn(), config: vi.fn(),
  KaneoRouteAuthError: class KaneoRouteAuthError extends Error { constructor(message: string, public status: number) { super(message); } },
}));
vi.mock("@/lib/kaneo-route-auth", () => ({
  KaneoRouteAuthError,
  requireKaneoWorkspaceDeleteAccess: requireBod,
}));
vi.mock("@/lib/kaneo-routing", () => ({ getKaneoProjectKeyForWorkspace: (workspaceId: string) => workspaceId }));
vi.mock("@/lib/kaneo", () => ({ getKaneoConfig: config, KaneoError: class KaneoError extends Error { constructor(message: string, public status: number) { super(message); } } }));
vi.mock("@/lib/kaneo-task-reconciliation", () => ({
  inspectAmbiguousKaneoTask: inspect,
  attachUniqueReconciledKaneoTask: attach,
  permitKaneoTaskRetryAfterNoMatch: permit,
  reconciliationErrorResponse: () => ({ status: 503, message: "Kaneo reconciliation is unavailable." }),
  KaneoTaskReconciliationError: class KaneoTaskReconciliationError extends Error {},
}));

import { GET, POST } from "@/app/api/integrations/kaneo/tasks/[taskId]/reconcile/route";

const context = { params: Promise.resolve({ taskId: "proveit-task" }) };
const request = (body?: object) => new Request("http://localhost/api/integrations/kaneo/tasks/proveit-task/reconcile", {
  method: body ? "POST" : "GET", headers: { Authorization: "Bearer token", ...(body ? { "Content-Type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined,
});

describe("Kaneo reconciliation route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireBod.mockResolvedValue({ uid: "bod" });
    config.mockReturnValue({ projects: { business: "business-project" } });
    inspect.mockResolvedValue({ projectId: "business-project", matchingTaskIds: [] });
    attach.mockResolvedValue(undefined);
    permit.mockResolvedValue(undefined);
  });

  it("requires BOD Business delete authorization before reading Kaneo", async () => {
    requireBod.mockRejectedValue(new KaneoRouteAuthError("Business task deletion requires BOD access.", 403));
    expect((await GET(request(), context)).status).toBe(403);
    expect(inspect).not.toHaveBeenCalled();
  });

  it("reports whether zero, one, or multiple exact matches can be safely reconciled", async () => {
    for (const [count, attachable, retryable] of [[0, false, true], [1, true, false], [2, false, false]] as const) {
      inspect.mockResolvedValueOnce({ projectId: "business-project", matchingTaskIds: Array.from({ length: count }, (_, index) => `task-${index}`) });
      const response = await GET(request(), context);
      expect(await response.json()).toMatchObject({ success: true, matchCount: count, canAttachUniqueMatch: attachable, canPermitRetry: retryable });
    }
  });

  it("attaches only a single BOD-confirmed match", async () => {
    inspect.mockResolvedValue({ projectId: "business-project", matchingTaskIds: ["kaneo-task"] });
    const response = await POST(request({ action: "attach_unique_match", confirmation: "CONFIRM_UNIQUE_KANEO_MATCH" }), context);
    expect(response.status).toBe(200);
    expect(attach).toHaveBeenCalledWith("proveit-task", "business", "business-project", "kaneo-task");
    expect(permit).not.toHaveBeenCalled();
  });

  it("permits one later manual retry only after a BOD-confirmed zero-match recheck", async () => {
    const response = await POST(request({ action: "permit_retry_after_no_match", confirmation: "CONFIRM_NO_KANEO_MATCH" }), context);
    expect(response.status).toBe(200);
    expect(permit).toHaveBeenCalledWith("proveit-task", "business", "business-project");
    expect(attach).not.toHaveBeenCalled();
  });

  it("never attaches or permits a retry for multiple matches", async () => {
    inspect.mockResolvedValue({ projectId: "business-project", matchingTaskIds: ["one", "two"] });
    const response = await POST(request({ action: "attach_unique_match", confirmation: "CONFIRM_UNIQUE_KANEO_MATCH" }), context);
    expect(response.status).toBe(409);
    expect(attach).not.toHaveBeenCalled();
    expect(permit).not.toHaveBeenCalled();
  });
});
