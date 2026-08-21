import { describe, expect, it } from "vitest";

import { defaultNotificationPreferences, normalizeNotificationPreferences, parseNotificationPreferences } from "@/lib/notification-preferences";

describe("notification preferences", () => {
  it("preserves in-app behavior and safely opts legacy users out of optional email", () => {
    expect(normalizeNotificationPreferences(undefined)).toEqual(defaultNotificationPreferences);
    expect(defaultNotificationPreferences.inApp).toEqual({ mentions: true, replies: true, assignments: true, reminders: true });
    expect(Object.values(defaultNotificationPreferences.email).every((value) => value === false)).toBe(true);
  });

  it("fills missing legacy keys without overriding explicit choices", () => {
    expect(normalizeNotificationPreferences({ inApp: { mentions: false }, email: { replies: true } })).toMatchObject({
      inApp: { mentions: false, replies: true },
      email: { mentions: false, replies: true, meetingReminders: false },
    });
  });

  it("accepts only the complete documented write shape", () => {
    expect(parseNotificationPreferences(defaultNotificationPreferences)).toEqual(defaultNotificationPreferences);
    expect(parseNotificationPreferences({ inApp: defaultNotificationPreferences.inApp, email: { ...defaultNotificationPreferences.email, forged: true } })).toBeNull();
    expect(parseNotificationPreferences({ inApp: { mentions: true }, email: defaultNotificationPreferences.email })).toBeNull();
  });
});
