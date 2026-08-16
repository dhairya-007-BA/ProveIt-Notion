import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  requireBOD,
  requireKaneoWorkspaceAccess,
  getKaneoConfig,
  getKaneoProjectIdForWorkspace,
  snapshotGet,
  collection,
  doc,
  kaneoPost,
  AdminAuthError,
  KaneoRouteAuthError,
  KaneoError,
  KaneoRoutingError,
} = vi.hoisted(() => {
  const snapshotGet = vi.fn();
  const doc = vi.fn(() => ({ get: snapshotGet }));
  const collection = vi.fn(() => ({ doc }));
  return {
    requireBOD: vi.fn(),
    requireKaneoWorkspaceAccess: vi.fn(),
    getKaneoConfig: vi.fn(),
    getKaneoProjectIdForWorkspace: vi.fn(),
    snapshotGet,
    collection,
    doc,
    kaneoPost: vi.fn(),
    AdminAuthError: class AdminAuthError extends Error {
      constructor(message: string, public status: number) { super(message); }
    },
    KaneoRouteAuthError: class KaneoRouteAuthError extends Error {
      constructor(message: string, public status: number) { super(message); }
    },
    KaneoError: class KaneoError extends Error {
      constructor(message: string, public status: number) { super(message); }
    },
    KaneoRoutingError: class KaneoRoutingError extends Error {},
  };
});

vi.mock("@/lib/admin-auth", () => ({ AdminAuthError, requireBOD }));
vi.mock("@/lib/kaneo-route-auth", () => ({ KaneoRouteAuthError, requireKaneoWorkspaceAccess }));
vi.mock("@/lib/firebase-admin", () => ({ adminDb: { collection } }));
vi.mock("@/lib/kaneo", () => ({ KaneoError, getKaneoConfig, kaneoPost }));
vi.mock("@/lib/kaneo-routing", () => ({ KaneoRoutingError, getKaneoProjectIdForWorkspace }));
vi.mock("@/lib/kaneo-integrations", () => ({
  DISPOSABLE_KANEO_TEST_MAPPING_ID: "__proveit_kaneo_disposable_test_business_v1__",
  DISPOSABLE_KANEO_TEST_IDEMPOTENCY_KEY: "proveit-kaneo-disposable-test-business-v1",
}));
vi.mock("@/lib/kaneo-task-create", () => ({
  DISPOSABLE_KANEO_TEST_MARKER: "ProveIt integration marker: proveit-kaneo-test-business-v1",
}));

import { GET } from "@/app/api/integrations/kaneo/tasks/test/reservation/route";

const mappingId = "__proveit_kaneo_disposable_test_business_v1__";
const config = { projects: { business: "business-project", technology: "technology-project" } };

function request() {
  return new Request("http://localhost/api/integrations/kaneo/tasks/test/reservation", {
    headers: { Authorization: "Bearer test-token" },
  });
}

function timestamp(iso: string) {
  return { toDate: () => new Date(iso) };
}

function reservation(overrides: Record<string, unknown> = {}) {
  return {
    provider: "kaneo",
    proveItTaskId: mappingId,
    proveItWorkspaceId: "business",
    kaneoProjectId: "business-project",
    state: "pending",
    idempotencyKey: "proveit-kaneo-disposable-test-business-v1",
    reconciliationMarker: "ProveIt integration marker: proveit-kaneo-test-business-v1",
    attemptCount: 1,
    createdAt: timestamp("2026-01-01T00:00:00.000Z"),
    updatedAt: timestamp("2026-01-02T00:00:00.000Z"),
    lastAttemptAt: timestamp("2026-01-03T00:00:00.000Z"),
    ...overrides,
  };
}

describe("disposable Kaneo reservation inspection route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireBOD.mockResolvedValue({ uid: "bod-1" });
    requireKaneoWorkspaceAccess.mockResolvedValue({ uid: "bod-1" });
    getKaneoConfig.mockReturnValue(config);
    getKaneoProjectIdForWorkspace.mockReturnValue("business-project");
    snapshotGet.mockResolvedValue({ exists: false, data: () => undefined });
  });

  it.each([
    ["missing authentication", new AdminAuthError("Authentication required.", 401)],
    ["invalid authentication", new AdminAuthError("Invalid or expired authentication.", 401)],
    ["inactive user", new AdminAuthError("Employee account is disabled.", 403)],
    ["non-BOD user", new AdminAuthError("Administrative capability required.", 403)],
  ])("rejects %s before Firestore access", async (_name, error) => {
    requireBOD.mockRejectedValue(error);
    const response = await GET(request());
    expect(response.status).toBe(error.status);
    expect(snapshotGet).not.toHaveBeenCalled();
    expect(kaneoPost).not.toHaveBeenCalled();
  });

  it.each([
    ["token verification", new AdminAuthError("Invalid or expired authentication.", 401), "firebase_token_verification_failed"],
    ["BOD profile read", new Error("Firestore profile read failed"), "bod_profile_read_failed"],
    ["inactive user", new AdminAuthError("Employee account is disabled.", 403), "inactive_user"],
    ["BOD authorization", new AdminAuthError("Administrative capability required.", 403), "bod_authorization_failed"],
  ])("returns a safe %s diagnostic", async (_name, error, diagnosticCategory) => {
    requireBOD.mockRejectedValue(error);
    const response = await GET(request());
    expect(await response.json()).toEqual({
      success: false,
      httpStatus: error instanceof AdminAuthError ? error.status : 503,
      diagnosticCategory,
      message: "Reservation inspection is unavailable.",
    });
    expect(snapshotGet).not.toHaveBeenCalled();
  });

  it("rejects an unauthorized Business user", async () => {
    requireKaneoWorkspaceAccess.mockRejectedValue(new KaneoRouteAuthError("Workspace access required.", 403));
    const response = await GET(request());
    expect(response.status).toBe(403);
    expect(snapshotGet).not.toHaveBeenCalled();
  });

  it.each([
    ["Business authorization read", new Error("Firestore membership read failed"), "business_authorization_read_failed"],
    ["Business authorization", new KaneoRouteAuthError("Workspace access required.", 403), "business_authorization_failed"],
  ])("returns a safe %s diagnostic", async (_name, error, diagnosticCategory) => {
    requireKaneoWorkspaceAccess.mockRejectedValue(error);
    const response = await GET(request());
    expect(await response.json()).toEqual({
      success: false,
      httpStatus: error instanceof KaneoRouteAuthError ? error.status : 503,
      diagnosticCategory,
      message: "Reservation inspection is unavailable.",
    });
    expect(snapshotGet).not.toHaveBeenCalled();
  });

  it("fails closed when immutable Business routing rejects", async () => {
    getKaneoProjectIdForWorkspace.mockImplementation(() => {
      throw new KaneoRoutingError("This workspace is not mapped to a Kaneo project.");
    });
    const response = await GET(request());
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ diagnosticCategory: "business_routing_failed" });
    expect(snapshotGet).not.toHaveBeenCalled();
  });

  it.each([
    ["permission denied", { code: "PERMISSION_DENIED", message: "must-not-return" }, "reservation_firestore_permission_denied"],
    ["not found", { code: "NOT_FOUND", message: "must-not-return" }, "reservation_firestore_not_found"],
    ["failed precondition", { code: "FAILED_PRECONDITION", message: "must-not-return" }, "reservation_firestore_failed_precondition"],
    ["network", { code: "UNAVAILABLE", message: "must-not-return" }, "reservation_firestore_network"],
    ["timeout", { code: "DEADLINE_EXCEEDED", message: "must-not-return" }, "reservation_firestore_timeout"],
    ["unknown", { code: "INTERNAL", message: "must-not-return" }, "reservation_firestore_unknown"],
  ])("classifies Firestore %s without exposing raw errors", async (_name, error, diagnosticCategory) => {
    snapshotGet.mockRejectedValue(error);
    const response = await GET(request());
    expect(await response.json()).toEqual({
      success: false,
      httpStatus: 503,
      diagnosticCategory,
      message: "Reservation inspection is unavailable.",
    });
    expect(kaneoPost).not.toHaveBeenCalled();
  });

  it.each([
    [7, "reservation_firestore_permission_denied"],
    [5, "reservation_firestore_not_found"],
    [9, "reservation_firestore_failed_precondition"],
    [4, "reservation_firestore_timeout"],
    [14, "reservation_firestore_network"],
    [13, "reservation_firestore_unknown"],
  ])("classifies numeric Firestore code %i without exposing raw errors", async (code, diagnosticCategory) => {
    snapshotGet.mockRejectedValue({ code, message: "must-not-return" });
    const response = await GET(request());
    expect(await response.json()).toEqual({
      success: false,
      httpStatus: 503,
      diagnosticCategory,
      message: "Reservation inspection is unavailable.",
    });
    expect(kaneoPost).not.toHaveBeenCalled();
  });

  it("reports an absent reservation without creating it", async () => {
    const response = await GET(request());
    expect(await response.json()).toEqual({
      success: true,
      httpStatus: 200,
      exists: false,
      message: "Disposable Kaneo test reservation does not exist.",
    });
    expect(collection).toHaveBeenCalledWith("kaneoTaskIntegrations");
    expect(doc).toHaveBeenCalledWith(mappingId);
    expect(snapshotGet).toHaveBeenCalledTimes(1);
    expect(kaneoPost).not.toHaveBeenCalled();
  });

  it.each(["pending", "linked", "failed", "reconciliation_required"])(
    "returns a normalized %s reservation",
    async (state) => {
      snapshotGet.mockResolvedValue({ exists: true, data: () => reservation({ state }) });
      const response = await GET(request());
      const body = await response.json();
      expect(body).toMatchObject({ success: true, exists: true, state, attemptCount: 1 });
      expect(kaneoPost).not.toHaveBeenCalled();
    }
  );

  it("omits kaneoTaskId when absent and serializes timestamps", async () => {
    snapshotGet.mockResolvedValue({ exists: true, data: () => reservation() });
    const response = await GET(request());
    const body = await response.json();
    expect(body.kaneoTaskId).toBeUndefined();
    expect(body.createdAt).toBe("2026-01-01T00:00:00.000Z");
    expect(body.updatedAt).toBe("2026-01-02T00:00:00.000Z");
    expect(body.lastAttemptAt).toBe("2026-01-03T00:00:00.000Z");
  });

  it("returns known optional fields and excludes unknown fields", async () => {
    snapshotGet.mockResolvedValue({
      exists: true,
      data: () => reservation({
        kaneoTaskId: "kaneo-task-1",
        lastErrorCategory: "ambiguous_result",
        rawSecret: "must-not-return",
      }),
    });
    const response = await GET(request());
    const body = await response.json();
    expect(body).toMatchObject({ kaneoTaskId: "kaneo-task-1", lastErrorCategory: "ambiguous_result" });
    expect(body.rawSecret).toBeUndefined();
    expect(kaneoPost).not.toHaveBeenCalled();
  });

  it("handles malformed records without exposing their fields", async () => {
    snapshotGet.mockResolvedValue({ exists: true, data: () => ({ rawToken: "must-not-return" }) });
    const response = await GET(request());
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      success: false,
      httpStatus: 502,
      diagnosticCategory: "reservation_malformed",
      message: "Reservation inspection is unavailable.",
    });
    expect(kaneoPost).not.toHaveBeenCalled();
  });

  it("classifies a configuration-stage failure as business routing", async () => {
    getKaneoConfig.mockImplementation(() => {
      throw new KaneoError("must-not-return", 503);
    });
    const response = await GET(request());
    expect(await response.json()).toEqual({
      success: false,
      httpStatus: 503,
      diagnosticCategory: "business_routing_failed",
      message: "Reservation inspection is unavailable.",
    });
    expect(snapshotGet).not.toHaveBeenCalled();
    expect(kaneoPost).not.toHaveBeenCalled();
  });

  it("classifies an unexpected reservation decoding failure by fixed stage", async () => {
    snapshotGet.mockResolvedValue({
      exists: true,
      data: () => { throw new Error("must-not-return"); },
    });
    const response = await GET(request());
    expect(await response.json()).toEqual({
      success: false,
      httpStatus: 503,
      diagnosticCategory: "reservation_firestore_get_failed",
      message: "Reservation inspection is unavailable.",
    });
    expect(kaneoPost).not.toHaveBeenCalled();
  });
});
