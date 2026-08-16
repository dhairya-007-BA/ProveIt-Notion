import { beforeEach, describe, expect, it, vi } from "vitest";

const { verifyIdToken, collection, isAdminCredentialFailure } = vi.hoisted(() => ({
  verifyIdToken: vi.fn(),
  collection: vi.fn(),
  isAdminCredentialFailure: vi.fn(() => false),
}));

vi.mock("@/lib/firebase-admin", () => ({
  adminAuth: { verifyIdToken },
  adminDb: { collection },
}));
vi.mock("@/lib/admin-auth-core", () => ({
  isAdminCredentialFailure,
}));

import {
  CustomFieldAuthError,
  requireCustomFieldWorkspaceUser,
} from "@/lib/custom-field-route-auth";

const request = new Request("http://localhost/api/workspaces/business/custom-fields", {
  headers: { Authorization: "Bearer test-token" },
});

describe("custom-field workspace authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    verifyIdToken.mockResolvedValue({ uid: "member-1" });
    isAdminCredentialFailure.mockReturnValue(false);
  });

  it("normalizes a trusted access-read failure without treating it as a user denial", async () => {
    collection.mockImplementation(() => ({ doc: () => ({ get: vi.fn().mockRejectedValue(new Error("sensitive Firestore detail")) }) }));

    await expect(requireCustomFieldWorkspaceUser(request, "business")).rejects.toMatchObject({
      status: 503,
      code: "custom_fields_access_check_failed",
      message: "Workspace access is temporarily unavailable.",
    });
  });

  it("continues to deny a missing workspace without exposing Firestore data", async () => {
    collection.mockImplementation((name: string) => ({
      doc: () => ({ get: vi.fn().mockResolvedValue(name === "users" ? { exists: true, data: () => ({ active: true, role: "member" }) } : { exists: false, data: () => undefined }) }),
    }));

    await expect(requireCustomFieldWorkspaceUser(request, "business")).rejects.toBeInstanceOf(CustomFieldAuthError);
    await expect(requireCustomFieldWorkspaceUser(request, "business")).rejects.toMatchObject({
      status: 404,
      code: "custom_fields_workspace_not_found",
    });
  });

  it("identifies unavailable server authentication separately from authorization", async () => {
    verifyIdToken.mockRejectedValue(new Error("sensitive credential failure"));
    isAdminCredentialFailure.mockReturnValue(true);

    await expect(requireCustomFieldWorkspaceUser(request, "business")).rejects.toMatchObject({
      status: 503,
      code: "custom_fields_server_authentication_unavailable",
      message: "Server authentication is temporarily unavailable.",
    });
    expect(collection).not.toHaveBeenCalled();
  });
});
