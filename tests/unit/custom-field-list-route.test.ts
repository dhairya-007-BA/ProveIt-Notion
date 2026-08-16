import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireCustomFieldWorkspaceUser, collection } = vi.hoisted(() => ({
  requireCustomFieldWorkspaceUser: vi.fn(),
  collection: vi.fn(),
}));

vi.mock("firebase-admin/firestore", () => ({ FieldValue: { serverTimestamp: vi.fn() } }));
vi.mock("@/lib/firebase-admin", () => ({ adminDb: { collection } }));
vi.mock("@/lib/custom-field-route-auth", () => ({
  requireCustomFieldWorkspaceUser,
  CustomFieldAuthError: class CustomFieldAuthError extends Error {
    constructor(message: string, public status: 401 | 403 | 404 | 503, public code = "custom_fields_authorization_failed") { super(message); }
  },
}));

import { GET } from "@/app/api/workspaces/[workspaceId]/custom-fields/route";

const context = { params: Promise.resolve({ workspaceId: "business" }) };
const request = new Request("http://localhost/api/workspaces/business/custom-fields", { headers: { Authorization: "Bearer test" } });

describe("custom-field list route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireCustomFieldWorkspaceUser.mockResolvedValue({ uid: "member-1" });
  });

  it("returns a safe, retryable response when the server field query fails", async () => {
    collection.mockReturnValue({ where: vi.fn(() => ({ get: vi.fn().mockRejectedValue(new Error("sensitive Firestore detail")) })) });

    const response = await GET(request, context);

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      success: false,
      code: "custom_fields_query_failed",
      message: "Custom fields could not be loaded.",
    });
  });
});
