import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireAuthenticatedProfile, update } = vi.hoisted(() => ({ requireAuthenticatedProfile: vi.fn(), update: vi.fn() }));
vi.mock("@/lib/profile-route-auth", () => ({ requireAuthenticatedProfile }));
vi.mock("firebase-admin/firestore", () => ({ FieldValue: { serverTimestamp: () => "server-time" } }));

import { GET, PATCH } from "@/app/api/profile/notification-preferences/route";
import { defaultNotificationPreferences } from "@/lib/notification-preferences";

function request(body?: unknown) {
  return new Request("http://localhost/api/profile/notification-preferences", { method: body === undefined ? "GET" : "PATCH", headers: { Authorization: "Bearer token", ...(body === undefined ? {} : { "Content-Type": "application/json" }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}

describe("notification preference API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedProfile.mockResolvedValue({ uid: "verified-user", profile: { active: true }, ref: { update } });
  });

  it("returns safe defaults for a legacy profile", async () => {
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, preferences: defaultNotificationPreferences });
  });

  it("writes only the verified user's normalized preference document", async () => {
    const response = await PATCH(request(defaultNotificationPreferences));
    expect(response.status).toBe(200);
    expect(requireAuthenticatedProfile).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith({ notificationPreferences: defaultNotificationPreferences, updatedAt: "server-time" });
  });

  it("rejects partial, unknown, or forged preference fields before writing", async () => {
    const response = await PATCH(request({ userId: "victim", inApp: defaultNotificationPreferences.inApp, email: defaultNotificationPreferences.email }));
    expect(response.status).toBe(422);
    expect(requireAuthenticatedProfile).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });
});
