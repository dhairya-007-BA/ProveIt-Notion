import { beforeEach, describe, expect, it, vi } from "vitest";

const { verifyIdToken, profileGet, workspaceGet, membershipGet } = vi.hoisted(() => ({
  verifyIdToken: vi.fn(),
  profileGet: vi.fn(),
  workspaceGet: vi.fn(),
  membershipGet: vi.fn(),
}));

vi.mock("@/lib/firebase-admin", () => ({
  adminAuth: { verifyIdToken },
  adminDb: {
    collection: (name: string) => ({
      doc: () => ({ get: name === "users" ? profileGet : name === "workspaces" ? workspaceGet : membershipGet }),
    }),
  },
}));

import { requireKaneoWorkspaceAccess } from "@/lib/kaneo-route-auth";

const request = () => new Request("http://localhost/api/integrations/kaneo/tasks?workspaceId=business", { headers: { Authorization: "Bearer user-token" } });

describe("Kaneo route authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    verifyIdToken.mockResolvedValue({ uid: "user-1" });
    profileGet.mockResolvedValue({ exists: true, data: () => ({ active: true, role: "business_intern" }) });
    workspaceGet.mockResolvedValue({ exists: true, data: () => ({ active: true }) });
    membershipGet.mockResolvedValue({ exists: true, data: () => ({ active: true }) });
  });

  it("rejects missing Firebase authentication", async () => {
    await expect(requireKaneoWorkspaceAccess(new Request("http://localhost"), "business")).rejects.toMatchObject({ status: 401 });
  });

  it("allows an active member of an active workspace", async () => {
    await expect(requireKaneoWorkspaceAccess(request(), "business")).resolves.toMatchObject({ uid: "user-1" });
    expect(verifyIdToken).toHaveBeenCalledWith("user-token", true);
  });

  it("rejects a user without workspace access", async () => {
    membershipGet.mockResolvedValue({ exists: false, data: () => undefined });
    await expect(requireKaneoWorkspaceAccess(request(), "business")).rejects.toMatchObject({ status: 403 });
  });

  it("preserves the legacy BOD fallback only with no explicit capabilities", async () => {
    profileGet.mockResolvedValue({ exists: true, data: () => ({ active: true, role: "bod", capabilities: {} }) });
    membershipGet.mockResolvedValue({ exists: false, data: () => undefined });
    await expect(requireKaneoWorkspaceAccess(request(), "business")).resolves.toMatchObject({ uid: "user-1" });
  });
});
