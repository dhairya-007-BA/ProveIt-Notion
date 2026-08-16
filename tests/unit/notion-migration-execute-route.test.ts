import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireCapability } = vi.hoisted(() => ({ requireCapability: vi.fn() }));
vi.mock("@/lib/admin-auth", () => ({ requireCapability, AdminAuthError: class AdminAuthError extends Error { constructor(message: string, public status: number) { super(message); } } }));

import { POST } from "@/app/api/admin/notion-migration/execute/route";

describe("Notion migration execution gate", () => {
  beforeEach(() => { vi.clearAllMocks(); requireCapability.mockResolvedValue({ uid: "admin" }); });
  it("never writes production content because execution remains disabled", async () => {
    const response = await POST(new Request("http://localhost/api/admin/notion-migration/execute", { method: "POST" }));
    expect(response.status).toBe(403); await expect(response.json()).resolves.toMatchObject({ code: "migration_execution_not_authorized" });
  });
});
