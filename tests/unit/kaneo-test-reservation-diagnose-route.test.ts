import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  requireBOD,
  requireKaneoWorkspaceAccess,
  originalGet,
  diagnosticCreate,
  diagnosticGet,
  diagnosticDelete,
  collection,
  doc,
  serverTimestamp,
  AdminAuthError,
  KaneoRouteAuthError,
} = vi.hoisted(() => {
  const originalGet = vi.fn();
  const diagnosticCreate = vi.fn();
  const diagnosticGet = vi.fn();
  const diagnosticDelete = vi.fn();
  const doc = vi.fn((id: string) => id === "__proveit_kaneo_disposable_test_business_v1__"
    ? { get: originalGet }
    : { create: diagnosticCreate, get: diagnosticGet, delete: diagnosticDelete });
  const collection = vi.fn(() => ({ doc }));
  return {
    requireBOD: vi.fn(),
    requireKaneoWorkspaceAccess: vi.fn(),
    originalGet,
    diagnosticCreate,
    diagnosticGet,
    diagnosticDelete,
    collection,
    doc,
    serverTimestamp: vi.fn(() => "server-timestamp"),
    AdminAuthError: class AdminAuthError extends Error {
      constructor(message: string, public status: number) { super(message); }
    },
    KaneoRouteAuthError: class KaneoRouteAuthError extends Error {
      constructor(message: string, public status: number) { super(message); }
    },
  };
});

vi.mock("@/lib/admin-auth", () => ({ AdminAuthError, requireBOD }));
vi.mock("@/lib/kaneo-route-auth", () => ({ KaneoRouteAuthError, requireKaneoWorkspaceAccess }));
vi.mock("@/lib/firebase-admin", () => ({ adminDb: { collection } }));
vi.mock("firebase-admin/firestore", () => ({ FieldValue: { serverTimestamp } }));
vi.mock("@/lib/kaneo-integrations", () => ({
  DISPOSABLE_KANEO_TEST_MAPPING_ID: "__proveit_kaneo_disposable_test_business_v1__",
}));

import { POST } from "@/app/api/integrations/kaneo/tasks/test/reservation/diagnose/route";

function request(body: unknown = { confirmation: "DIAGNOSE_KANEO_RESERVATION" }) {
  return new Request("http://localhost/api/integrations/kaneo/tasks/test/reservation/diagnose", {
    method: "POST",
    headers: { Authorization: "Bearer test-token", "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("disposable Kaneo reservation diagnostic route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireBOD.mockResolvedValue({ uid: "bod-1" });
    requireKaneoWorkspaceAccess.mockResolvedValue({ uid: "bod-1" });
    originalGet.mockResolvedValue({ exists: false });
    diagnosticCreate.mockResolvedValue(undefined);
    diagnosticGet.mockResolvedValue({ exists: true });
    diagnosticDelete.mockResolvedValue(undefined);
  });

  it("rejects any body other than the exact confirmation before Firestore activity", async () => {
    const response = await POST(request({ confirmation: "wrong", extra: true }));
    expect(response.status).toBe(422);
    expect(requireBOD).not.toHaveBeenCalled();
    expect(originalGet).not.toHaveBeenCalled();
    expect(diagnosticCreate).not.toHaveBeenCalled();
  });

  it.each([
    ["BOD authorization", new AdminAuthError("Authentication required.", 401)],
    ["Business authorization", new KaneoRouteAuthError("Workspace access required.", 403)],
  ])("rejects %s before Firestore activity", async (_name, error) => {
    if (error instanceof AdminAuthError) requireBOD.mockRejectedValue(error);
    else requireKaneoWorkspaceAccess.mockRejectedValue(error);
    const response = await POST(request());
    expect(response.status).toBe(error.status);
    expect(originalGet).not.toHaveBeenCalled();
    expect(diagnosticCreate).not.toHaveBeenCalled();
  });

  it("creates, reads, and deletes only the separate diagnostic document", async () => {
    const response = await POST(request());
    expect(await response.json()).toEqual({
      success: true,
      originalReservationReadable: true,
      originalReservationExists: false,
      diagnosticWriteSucceeded: true,
      diagnosticReadSucceeded: true,
      diagnosticDeleteSucceeded: true,
      message: "Reservation diagnostic completed.",
    });
    expect(collection).toHaveBeenCalledWith("kaneoTaskIntegrations");
    expect(doc).toHaveBeenNthCalledWith(1, "__proveit_kaneo_disposable_test_business_v1__");
    expect(doc).toHaveBeenNthCalledWith(2, "__proveit_kaneo_reservation_diagnostic_v1__");
    expect(diagnosticCreate).toHaveBeenCalledWith({
      provider: "kaneo",
      diagnostic: true,
      createdAt: "server-timestamp",
    });
    expect(diagnosticGet).toHaveBeenCalledTimes(1);
    expect(diagnosticDelete).toHaveBeenCalledTimes(1);
  });

  it("never alters either document when the original reservation exists", async () => {
    originalGet.mockResolvedValue({ exists: true });
    const response = await POST(request());
    expect(await response.json()).toMatchObject({
      success: true,
      originalReservationReadable: true,
      originalReservationExists: true,
      diagnosticWriteSucceeded: false,
      diagnosticReadSucceeded: false,
      diagnosticDeleteSucceeded: false,
    });
    expect(diagnosticCreate).not.toHaveBeenCalled();
    expect(diagnosticGet).not.toHaveBeenCalled();
    expect(diagnosticDelete).not.toHaveBeenCalled();
  });

  it.each([
    ["diagnostic_write", diagnosticCreate],
    ["diagnostic_read", diagnosticGet],
    ["diagnostic_delete", diagnosticDelete],
  ])("returns only the fixed %s failure stage", async (stage, operation) => {
    operation.mockRejectedValue(new Error("must-not-return"));
    const response = await POST(request());
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      success: false,
      originalReservationReadable: false,
      originalReservationExists: false,
      diagnosticWriteSucceeded: false,
      diagnosticReadSucceeded: false,
      diagnosticDeleteSucceeded: false,
      stage,
      message: "Reservation diagnostic could not complete.",
    });
  });

  it("returns only whitelisted numeric original-read diagnostics", async () => {
    originalGet.mockRejectedValue({
      name: "must-not-return",
      code: 7,
      message: "must-not-return",
      details: "must-not-return",
      metadata: { secret: "must-not-return" },
      stack: "must-not-return",
      cause: { code: 16 },
    });
    const response = await POST(request());
    expect(await response.json()).toEqual({
      success: false,
      originalReservationReadable: false,
      originalReservationExists: false,
      diagnosticWriteSucceeded: false,
      diagnosticReadSucceeded: false,
      diagnosticDeleteSucceeded: false,
      stage: "original_read",
      isError: false,
      typeofError: "object",
      errorName: "unknown",
      constructorName: "unknown",
      hasCode: true,
      typeofCode: "number",
      numericCode: 7,
      normalizedStringCode: "unknown",
      message: "Reservation diagnostic could not complete.",
    });
  });

  it("normalizes only known string original-read codes", async () => {
    const error = new Error("must-not-return") as Error & { code?: unknown; details?: string; metadata?: unknown; cause?: unknown };
    error.code = "FAILED_PRECONDITION";
    error.details = "must-not-return";
    error.metadata = { secret: "must-not-return" };
    error.cause = { code: 7 };
    originalGet.mockRejectedValue(error);
    const response = await POST(request());
    expect(await response.json()).toEqual({
      success: false,
      originalReservationReadable: false,
      originalReservationExists: false,
      diagnosticWriteSucceeded: false,
      diagnosticReadSucceeded: false,
      diagnosticDeleteSucceeded: false,
      stage: "original_read",
      isError: true,
      typeofError: "object",
      errorName: "Error",
      constructorName: "Error",
      hasCode: true,
      typeofCode: "string",
      numericCode: null,
      normalizedStringCode: "failed-precondition",
      message: "Reservation diagnostic could not complete.",
    });
  });

  it("suppresses unknown original-read codes", async () => {
    const error = new Error("must-not-return") as Error & { code?: unknown };
    error.code = 13;
    originalGet.mockRejectedValue(error);
    const response = await POST(request());
    const body = await response.json();
    expect(body).toMatchObject({
      stage: "original_read",
      hasCode: true,
      typeofCode: "number",
      numericCode: null,
      normalizedStringCode: "unknown",
    });
    expect(body).not.toHaveProperty("details");
    expect(body).not.toHaveProperty("metadata");
    expect(body).not.toHaveProperty("stack");
    expect(body).not.toHaveProperty("cause");
  });
});
