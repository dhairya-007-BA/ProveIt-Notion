import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  requireBOD,
  requireKaneoWorkspaceAccess,
  getKaneoConfig,
  getKaneoProjectIdForWorkspace,
  preflightDisposableKaneoTask,
  reserveDisposableKaneoTest,
  markDisposableKaneoTestAttempt,
  createDisposableKaneoTask,
  linkDisposableKaneoTest,
  requireDisposableKaneoTestReconciliation,
  failDisposableKaneoTest,
  AdminAuthError,
  KaneoRouteAuthError,
  KaneoError,
  KaneoTaskCreateError,
  KaneoRoutingError,
} = vi.hoisted(() => ({
  requireBOD: vi.fn(),
  requireKaneoWorkspaceAccess: vi.fn(),
  getKaneoConfig: vi.fn(),
  getKaneoProjectIdForWorkspace: vi.fn(),
  preflightDisposableKaneoTask: vi.fn(),
  reserveDisposableKaneoTest: vi.fn(),
  markDisposableKaneoTestAttempt: vi.fn(),
  createDisposableKaneoTask: vi.fn(),
  linkDisposableKaneoTest: vi.fn(),
  requireDisposableKaneoTestReconciliation: vi.fn(),
  failDisposableKaneoTest: vi.fn(),
  AdminAuthError: class AdminAuthError extends Error {
    constructor(message: string, public status: number) { super(message); }
  },
  KaneoRouteAuthError: class KaneoRouteAuthError extends Error {
    constructor(message: string, public status: number) { super(message); }
  },
  KaneoError: class KaneoError extends Error {
    constructor(
      message: string,
      public status: number,
      public category: string = "network"
    ) { super(message); }
  },
  KaneoTaskCreateError: class KaneoTaskCreateError extends Error {
    constructor(message: string, public status: number) { super(message); }
  },
  KaneoRoutingError: class KaneoRoutingError extends Error {},
}));

vi.mock("@/lib/admin-auth", () => ({ AdminAuthError, requireBOD }));
vi.mock("@/lib/kaneo-route-auth", () => ({ KaneoRouteAuthError, requireKaneoWorkspaceAccess }));
vi.mock("@/lib/kaneo", () => ({ KaneoError, getKaneoConfig }));
vi.mock("@/lib/kaneo-routing", () => ({ KaneoRoutingError, getKaneoProjectIdForWorkspace }));
vi.mock("@/lib/kaneo-task-create", () => ({
  KaneoTaskCreateError,
  preflightDisposableKaneoTask,
  createDisposableKaneoTask,
}));
vi.mock("@/lib/kaneo-integrations", () => ({
  reserveDisposableKaneoTest,
  markDisposableKaneoTestAttempt,
  createDisposableKaneoTask: vi.fn(),
  linkDisposableKaneoTest,
  requireDisposableKaneoTestReconciliation,
  failDisposableKaneoTest,
}));

import { POST } from "@/app/api/integrations/kaneo/tasks/test/route";

const config = {
  projects: { business: "business-project", technology: "technology-project" },
};

function request(body: unknown = { confirmation: "CREATE_DISPOSABLE_KANEO_TEST_TASK" }) {
  return new Request("http://localhost/api/integrations/kaneo/tasks/test", {
    method: "POST",
    headers: { Authorization: "Bearer test-token", "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("disposable Kaneo test route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireBOD.mockResolvedValue({ uid: "bod-1" });
    requireKaneoWorkspaceAccess.mockResolvedValue({ uid: "bod-1" });
    getKaneoConfig.mockReturnValue(config);
    getKaneoProjectIdForWorkspace.mockReturnValue("business-project");
    preflightDisposableKaneoTask.mockResolvedValue(undefined);
    reserveDisposableKaneoTest.mockResolvedValue({ canCreate: true, state: "pending" });
    markDisposableKaneoTestAttempt.mockResolvedValue(undefined);
    createDisposableKaneoTask.mockResolvedValue({
      id: "kaneo-task-1",
      projectId: "business-project",
      title: "[PROVEIT INTEGRATION TEST] Disposable task",
      status: "to-do",
      priority: "no-priority",
    });
    linkDisposableKaneoTest.mockResolvedValue(undefined);
    requireDisposableKaneoTestReconciliation.mockResolvedValue(undefined);
    failDisposableKaneoTest.mockResolvedValue(undefined);
  });

  it("rejects malformed confirmation before authentication or upstream activity", async () => {
    const response = await POST(request({ confirmation: "wrong" }));
    expect(response.status).toBe(422);
    expect(requireBOD).not.toHaveBeenCalled();
    expect(createDisposableKaneoTask).not.toHaveBeenCalled();
  });

  it("rejects unexpected caller-controlled task fields", async () => {
    const response = await POST(request({
      confirmation: "CREATE_DISPOSABLE_KANEO_TEST_TASK",
      projectId: "attacker-project",
    }));
    expect(response.status).toBe(422);
    expect(createDisposableKaneoTask).not.toHaveBeenCalled();
  });

  it.each([
    ["missing authentication", new AdminAuthError("Authentication required.", 401)],
    ["invalid authentication", new AdminAuthError("Invalid or expired authentication.", 401)],
    ["non-BOD user", new AdminAuthError("Administrative capability required.", 403)],
  ])("rejects %s", async (_name, error) => {
    requireBOD.mockRejectedValue(error);
    const response = await POST(request());
    expect(response.status).toBe(error.status);
    expect(requireKaneoWorkspaceAccess).not.toHaveBeenCalled();
  });

  it.each([
    ["inactive user", new KaneoRouteAuthError("Active employee account required.", 403)],
    ["unauthorized Business user", new KaneoRouteAuthError("Workspace access required.", 403)],
  ])("rejects %s", async (_name, error) => {
    requireKaneoWorkspaceAccess.mockRejectedValue(error);
    const response = await POST(request());
    expect(response.status).toBe(error.status);
    expect(createDisposableKaneoTask).not.toHaveBeenCalled();
  });

  it("fails closed when immutable workspace routing rejects the target", async () => {
    getKaneoProjectIdForWorkspace.mockImplementation(() => {
      throw new KaneoRoutingError("This workspace is not mapped to a Kaneo project.");
    });
    const response = await POST(request());
    expect(response.status).toBe(422);
    expect(preflightDisposableKaneoTask).not.toHaveBeenCalled();
    expect(createDisposableKaneoTask).not.toHaveBeenCalled();
  });

  it("reports a missing to-do column without reserving or posting", async () => {
    preflightDisposableKaneoTask.mockRejectedValue(new KaneoTaskCreateError(
      "The mapped Kaneo project does not expose the required to-do status.",
      422
    ));
    const response = await POST(request());
    expect(await response.json()).toEqual({
      success: false,
      httpStatus: 422,
      diagnosticCategory: "column_preflight_missing_to_do",
      message: "The mapped Kaneo project does not expose the required to-do status.",
    });
    expect(reserveDisposableKaneoTest).not.toHaveBeenCalled();
    expect(createDisposableKaneoTask).toHaveBeenCalledTimes(0);
  });

  it.each([
    ["network", new KaneoError("Kaneo service is unavailable.", 503, "network"), 503, "column_preflight_network"],
    ["timeout", new KaneoError("Kaneo service is unavailable.", 503, "timeout"), 503, "column_preflight_timeout"],
    ["upstream 4xx", new KaneoError("Kaneo service could not complete the request.", 502, "upstream_4xx"), 502, "column_preflight_upstream_4xx"],
    ["upstream 5xx", new KaneoError("Kaneo service could not complete the request.", 503, "upstream_5xx"), 503, "column_preflight_upstream_5xx"],
    ["malformed response", new KaneoError("Kaneo returned an invalid response.", 502, "malformed_response"), 502, "column_preflight_malformed_response"],
  ])("classifies preflight %s without posting", async (_name, error, status, diagnosticCategory) => {
    preflightDisposableKaneoTask.mockRejectedValue(error);

    const response = await POST(request());
    expect(response.status).toBe(status);
    expect(await response.json()).toMatchObject({
      success: false,
      httpStatus: status,
      diagnosticCategory,
    });
    expect(reserveDisposableKaneoTest).not.toHaveBeenCalled();
    expect(createDisposableKaneoTask).toHaveBeenCalledTimes(0);
  });

  it("distinguishes a reservation failure without posting", async () => {
    reserveDisposableKaneoTest.mockRejectedValue(new Error("Firestore unavailable"));

    const response = await POST(request());
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      success: false,
      httpStatus: 503,
      diagnosticCategory: "reservation_failed",
      message: "Kaneo service is unavailable.",
    });
    expect(createDisposableKaneoTask).toHaveBeenCalledTimes(0);
  });

  it.each(["pending", "linked", "reconciliation_required", "failed"])(
    "does not post when an existing reservation is %s",
    async (state) => {
      reserveDisposableKaneoTest.mockResolvedValue({ canCreate: false, state });
      const response = await POST(request());
      expect(response.status).toBe(409);
      expect(createDisposableKaneoTask).not.toHaveBeenCalled();
    }
  );

  it("normalizes a successful create and links the mapping", async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      httpStatus: 200,
      kaneoTaskId: "kaneo-task-1",
      projectId: "business-project",
      title: "[PROVEIT INTEGRATION TEST] Disposable task",
      status: "to-do",
      priority: "no-priority",
      state: "linked",
      message: "Disposable Kaneo test task created and linked.",
    });
    expect(linkDisposableKaneoTest).toHaveBeenCalledWith("kaneo-task-1");
  });

  it("marks a known upstream 4xx as failed without leaking upstream data", async () => {
    createDisposableKaneoTask.mockRejectedValue(new KaneoError("Kaneo service could not complete the request.", 502, "upstream_4xx"));
    const response = await POST(request());
    expect(response.status).toBe(502);
    expect(failDisposableKaneoTest).toHaveBeenCalledWith("upstream_4xx");
    expect(await response.json()).toEqual({
      success: false,
      httpStatus: 502,
      state: "failed",
      message: "Kaneo service could not complete the request.",
    });
  });

  it.each([
    ["upstream 5xx", new KaneoError("Kaneo service could not complete the request.", 503, "upstream_5xx"), "upstream_5xx"],
    ["timeout", new KaneoError("Kaneo service is unavailable.", 503, "timeout"), "timeout"],
    ["malformed upstream response", new KaneoTaskCreateError("Kaneo returned an invalid response.", 502), "malformed_response"],
  ])("requires reconciliation after %s", async (_name, error, category) => {
    createDisposableKaneoTask.mockRejectedValue(error);
    const response = await POST(request());
    expect(response.status).toBe(503);
    expect(requireDisposableKaneoTestReconciliation).toHaveBeenCalledWith(category);
    expect(createDisposableKaneoTask).toHaveBeenCalledTimes(1);
  });

  it("requires reconciliation if Kaneo succeeds but mapping persistence fails", async () => {
    linkDisposableKaneoTest.mockRejectedValue(new Error("write failed"));
    const response = await POST(request());
    expect(response.status).toBe(503);
    expect(requireDisposableKaneoTestReconciliation).toHaveBeenCalledWith("mapping_write_failed");
  });

  it("permits only one upstream post across simultaneous requests", async () => {
    reserveDisposableKaneoTest
      .mockResolvedValueOnce({ canCreate: true, state: "pending" })
      .mockResolvedValueOnce({ canCreate: false, state: "pending" });

    const [first, second] = await Promise.all([POST(request()), POST(request())]);
    expect([first.status, second.status].sort()).toEqual([200, 409]);
    expect(createDisposableKaneoTask).toHaveBeenCalledTimes(1);
  });

  it("issues zero additional posts after an ambiguous result", async () => {
    createDisposableKaneoTask.mockRejectedValueOnce(new KaneoError("Kaneo service is unavailable.", 503, "timeout"));
    reserveDisposableKaneoTest
      .mockResolvedValueOnce({ canCreate: true, state: "pending" })
      .mockResolvedValueOnce({ canCreate: false, state: "reconciliation_required" });

    await POST(request());
    await POST(request());
    expect(createDisposableKaneoTask).toHaveBeenCalledTimes(1);
  });
});
