import { beforeEach, describe, expect, it, vi } from "vitest";

const { verifyIdToken, get } = vi.hoisted(() => ({ verifyIdToken: vi.fn(), get: vi.fn() }));
const ref = { update: vi.fn() };

vi.mock("@/lib/firebase-admin", () => ({
  adminAuth: { verifyIdToken },
  adminDb: { collection: vi.fn(() => ({ doc: vi.fn(() => ({ get })) })) },
}));

import { requireAuthenticatedProfile } from "@/lib/profile-route-auth";

function request(token = "valid-token") {
  return new Request("http://localhost/api/profile", { headers: token ? { Authorization: `Bearer ${token}` } : {} });
}

describe("requireAuthenticatedProfile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    verifyIdToken.mockResolvedValue({ uid: "employee-1" });
    get.mockResolvedValue({ exists: true, data: () => ({ active: true, employeeId: "P-001" }), ref });
  });

  it("rejects an unauthenticated request before a Firestore profile lookup", async () => {
    await expect(requireAuthenticatedProfile(request(""))).rejects.toMatchObject({ status: 401 });
    expect(verifyIdToken).not.toHaveBeenCalled();
    expect(get).not.toHaveBeenCalled();
  });

  it("rejects an inactive verified employee", async () => {
    get.mockResolvedValue({ exists: true, data: () => ({ active: false }), ref });
    await expect(requireAuthenticatedProfile(request())).rejects.toMatchObject({ status: 403 });
    expect(verifyIdToken).toHaveBeenCalledWith("valid-token", true);
  });

  it("derives the uid from the verified token and returns only that user's profile reference", async () => {
    await expect(requireAuthenticatedProfile(request())).resolves.toEqual({
      uid: "employee-1", profile: { active: true, employeeId: "P-001" }, ref,
    });
  });
});
