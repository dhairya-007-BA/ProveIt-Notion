import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireAuthenticatedProfile, update, deleteField, serverTimestamp } = vi.hoisted(() => ({
  requireAuthenticatedProfile: vi.fn(),
  update: vi.fn(),
  deleteField: vi.fn(() => "delete-phone"),
  serverTimestamp: vi.fn(() => "server-time"),
}));

vi.mock("@/lib/profile-route-auth", () => ({ requireAuthenticatedProfile }));
vi.mock("firebase-admin/firestore", () => ({
  FieldValue: { delete: deleteField, serverTimestamp },
}));

import { PATCH } from "@/app/api/profile/route";
import { PROFILE_PHONE_MAX_LENGTH, normalizePhoneNumber } from "@/lib/profile";

function request(body: unknown) {
  return new Request("http://localhost/api/profile", {
    method: "PATCH",
    headers: { Authorization: "Bearer test-token", "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("profile phone validation", () => {
  it("accepts ordinary international formatting and preserves an empty optional value", () => {
    expect(normalizePhoneNumber(" +1   (604) 555-0123 ")).toBe("+1 (604) 555-0123");
    expect(normalizePhoneNumber("   ")).toBe("");
  });

  it("rejects controls, non-phone characters, non-strings, and excess length", () => {
    expect(normalizePhoneNumber("+1\n555")).toBeNull();
    expect(normalizePhoneNumber("+1 555 ext 4")).toBeNull();
    expect(normalizePhoneNumber(123)).toBeNull();
    expect(normalizePhoneNumber("1".repeat(PROFILE_PHONE_MAX_LENGTH + 1))).toBeNull();
  });
});

describe("PATCH /api/profile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedProfile.mockResolvedValue({
      uid: "employee-1",
      profile: { name: "Nadia Patel", email: "nadia@proveit.test", employeeId: "P-001", role: "member", active: true },
      ref: { update },
    });
  });

  it.each([
    { employeeId: "spoofed" },
    { phoneNumber: "+1 555 0100", role: "bod" },
    { phoneNumber: "+1 555 0100", workspaceMemberships: ["business"] },
    { name: "spoofed" },
  ])("rejects profile or permission spoofing", async (body) => {
    const response = await PATCH(request(body));
    expect(response.status).toBe(422);
    expect(requireAuthenticatedProfile).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it("updates only the verified user's phone number", async () => {
    const response = await PATCH(request({ phoneNumber: " +44 20 7946 0958 " }));
    expect(response.status).toBe(200);
    expect(requireAuthenticatedProfile).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith({ phoneNumber: "+44 20 7946 0958", updatedAt: "server-time" });
    expect(await response.json()).toEqual({
      success: true,
      profile: {
        uid: "employee-1", name: "Nadia Patel", email: "nadia@proveit.test", phoneNumber: "+44 20 7946 0958",
        employeeId: "P-001", role: "member", department: null,
      },
    });
  });

  it("clears only the optional phone field", async () => {
    const response = await PATCH(request({ phoneNumber: "" }));
    expect(response.status).toBe(200);
    expect(update).toHaveBeenCalledWith({ phoneNumber: "delete-phone", updatedAt: "server-time" });
  });

  it("rejects malformed phone input before changing the profile", async () => {
    const response = await PATCH(request({ phoneNumber: "not a phone" }));
    expect(response.status).toBe(422);
    expect(update).not.toHaveBeenCalled();
  });
});
