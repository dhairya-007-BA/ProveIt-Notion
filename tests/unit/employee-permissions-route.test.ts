import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireCapability, collection } = vi.hoisted(() => ({
  requireCapability: vi.fn(),
  collection: vi.fn(),
}));

vi.mock("firebase-admin/firestore", () => ({ FieldValue: { serverTimestamp: vi.fn() } }));
vi.mock("@/lib/firebase-admin", () => ({ adminDb: { collection, runTransaction: vi.fn() } }));
vi.mock("@/lib/admin-auth", () => ({
  requireCapability,
  AdminAuthError: class AdminAuthError extends Error {
    constructor(message: string, public status: number) { super(message); }
  },
}));
vi.mock("@/lib/permissions", () => ({ GLOBAL_CAPABILITIES: ["manageEmployees", "manageWorkspaces", "manageGlobalSettings"] }));

import { GET } from "@/app/api/admin/employees/[uid]/permissions/route";

const context = { params: Promise.resolve({ uid: "employee-1" }) };
const request = new Request("http://localhost/api/admin/employees/employee-1/permissions", { headers: { Authorization: "Bearer test" } });

describe("employee permissions GET route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireCapability.mockResolvedValue({ uid: "admin-1" });
  });

  it("returns the server-authorized workspace list with the employee permissions", async () => {
    collection.mockImplementation((name: string) => {
      if (name === "users") return { doc: () => ({ get: vi.fn().mockResolvedValue({ exists: true, data: () => ({ name: "Employee", capabilities: {} }) }) }) };
      if (name === "workspaceMemberships") return { where: () => ({ get: vi.fn().mockResolvedValue({ docs: [{ id: "business_employee-1", data: () => ({ workspaceId: "business", userId: "employee-1", active: true }) }] }) }) };
      return { get: vi.fn().mockResolvedValue({ docs: [{ id: "business", data: () => ({ name: "Business", active: true }) }] }) };
    });

    const response = await GET(request, context);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      workspaces: [{ id: "business", name: "Business" }],
      memberships: [{ workspaceId: "business", userId: "employee-1" }],
    });
  });

  it("normalizes an Admin Firestore lookup failure without exposing its error", async () => {
    collection.mockImplementation(() => ({ doc: () => ({ get: vi.fn().mockRejectedValue(new Error("sensitive Firestore detail")) }) }));

    const response = await GET(request, context);

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      success: false,
      code: "employee_permissions_load_failed",
      message: "Employee permissions could not be loaded.",
    });
  });
});
