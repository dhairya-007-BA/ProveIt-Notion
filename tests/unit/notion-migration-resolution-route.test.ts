import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireCapability, set, employeeGet, resolutionGet } = vi.hoisted(() => ({ requireCapability: vi.fn(), set: vi.fn(), employeeGet: vi.fn(), resolutionGet: vi.fn() }));
vi.mock("@/lib/admin-auth", () => ({ requireCapability, AdminAuthError: class AdminAuthError extends Error { constructor(message: string, public status: number) { super(message); } } }));
vi.mock("@/lib/firebase-admin", () => ({
  adminDb: {
    collection: vi.fn((name: string) => {
      if (name === "users") return { where: vi.fn(() => ({ limit: vi.fn(() => ({ get: employeeGet })) })) };
      return {
        doc: vi.fn(() => ({
          set,
          collection: vi.fn(() => ({ get: resolutionGet, doc: vi.fn(() => ({ set })) })),
        })),
      };
    }),
  },
}));
vi.mock("firebase-admin/firestore", () => ({ FieldValue: { serverTimestamp: vi.fn(() => "server-time") } }));

import { POST } from "@/app/api/admin/notion-migration/resolutions/route";

function request(resolution: unknown) {
  return new Request("http://localhost/api/admin/notion-migration/resolutions", { method: "POST", body: JSON.stringify({ sourceFingerprint: "a".repeat(64), resolution }), headers: { "Content-Type": "application/json", Authorization: "Bearer test" } });
}

describe("Notion migration resolution route", () => {
  beforeEach(() => { vi.clearAllMocks(); requireCapability.mockResolvedValue({ uid: "admin" }); set.mockResolvedValue(undefined); employeeGet.mockResolvedValue({ size: 1, docs: [{ data: () => ({ active: true }) }] }); });

  it("requires capability before persisting a configuration decision", async () => {
    const { AdminAuthError } = await import("@/lib/admin-auth"); requireCapability.mockRejectedValue(new AdminAuthError("Administrative capability required.", 403));
    const response = await POST(request({ type: "workspace", key: "source", value: { workspaceId: "business" } }));
    expect(response.status).toBe(403); expect(set).not.toHaveBeenCalled();
  });

  it("persists only validated, fingerprint-scoped configuration decisions", async () => {
    const response = await POST(request({ type: "workspace", key: "source", value: { workspaceId: "business" } }));
    expect(response.status).toBe(200); expect(set).toHaveBeenCalledTimes(2);
    const invalid = await POST(request({ type: "property", key: "db:field", value: { choice: "skip" } }));
    expect(invalid.status).toBe(422);
  });
});
