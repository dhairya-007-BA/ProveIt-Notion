import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireCapability, get, preview } = vi.hoisted(() => ({ requireCapability: vi.fn(), get: vi.fn(), preview: vi.fn() }));
vi.mock("@/lib/admin-auth", () => ({ requireCapability, AdminAuthError: class AdminAuthError extends Error { constructor(message: string, public status: number) { super(message); } } }));
vi.mock("@/lib/firebase-admin", () => ({ adminDb: { collection: vi.fn(() => ({ where: vi.fn(() => ({ get })) })) } }));
vi.mock("@/lib/notion-migration-preview", () => ({ createNotionMigrationPreview: preview }));

import { POST } from "@/app/api/admin/notion-migration/preview/route";

function request() {
  const form = new FormData(); form.append("archives", new File(["zip"], "export.zip", { type: "application/zip" }));
  return new Request("http://localhost/api/admin/notion-migration/preview", { method: "POST", headers: { Authorization: "Bearer test-token" }, body: form });
}

describe("Notion migration preview route", () => {
  beforeEach(() => { vi.clearAllMocks(); requireCapability.mockResolvedValue({ uid: "admin" }); get.mockResolvedValue({ docs: [{ data: () => ({ employeeId: "P-001", name: "Nadia", email: "nadia@proveit.test" }) }] }); preview.mockResolvedValue({ batchId: "notion-preview-v1-test", dryRun: true, totals: {}, records: [] }); });

  it("requires the workspace-management capability before reading files or employees", async () => {
    const { AdminAuthError } = await import("@/lib/admin-auth"); requireCapability.mockRejectedValue(new AdminAuthError("Administrative capability required.", 403));
    const response = await POST(request());
    expect(response.status).toBe(403); expect(get).not.toHaveBeenCalled(); expect(preview).not.toHaveBeenCalled();
  });

  it("builds a read-only preview with safe employee identity candidates", async () => {
    const response = await POST(request()); const body = await response.json();
    expect(response.status).toBe(200); expect(body.manifest.dryRun).toBe(true);
    expect(preview).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ name: "export.zip" })]), [{ employeeId: "P-001", name: "Nadia", email: "nadia@proveit.test" }]);
  });
});
