export const notificationPreferenceKeys = [
  "mentions",
  "replies",
  "assignments",
  "reminders",
] as const;

export const emailPreferenceKeys = [
  "mentions",
  "replies",
  "taskAssignments",
  "taskReminders",
  "meetingInvitations",
  "meetingReminders",
  "digest",
] as const;

export type InAppPreferenceKey = (typeof notificationPreferenceKeys)[number];
export type EmailPreferenceKey = (typeof emailPreferenceKeys)[number];

export type NotificationPreferences = {
  inApp: Record<InAppPreferenceKey, boolean>;
  email: Record<EmailPreferenceKey, boolean>;
};

// Existing employees received in-app updates before preferences existed, so
// those defaults preserve current behavior. Email is opt-in: deploying an API
// key must not unexpectedly subscribe every legacy employee to email.
export const defaultNotificationPreferences: NotificationPreferences = {
  inApp: { mentions: true, replies: true, assignments: true, reminders: true },
  email: {
    mentions: false,
    replies: false,
    taskAssignments: false,
    taskReminders: false,
    meetingInvitations: false,
    meetingReminders: false,
    digest: false,
  },
};

function booleanRecord<T extends string>(value: unknown, keys: readonly T[], defaults: Record<T, boolean>) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  return Object.fromEntries(keys.map((key) => [key, typeof source[key] === "boolean" ? source[key] : defaults[key]])) as Record<T, boolean>;
}

export function normalizeNotificationPreferences(value: unknown): NotificationPreferences {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  return {
    inApp: booleanRecord(source.inApp, notificationPreferenceKeys, defaultNotificationPreferences.inApp),
    email: booleanRecord(source.email, emailPreferenceKeys, defaultNotificationPreferences.email),
  };
}

export function parseNotificationPreferences(value: unknown): NotificationPreferences | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  if (Object.keys(source).some((key) => key !== "inApp" && key !== "email")) return null;
  if (!source.inApp || typeof source.inApp !== "object" || Array.isArray(source.inApp) ||
      !source.email || typeof source.email !== "object" || Array.isArray(source.email)) return null;
  const inApp = source.inApp as Record<string, unknown>;
  const email = source.email as Record<string, unknown>;
  if (Object.keys(inApp).some((key) => !(notificationPreferenceKeys as readonly string[]).includes(key)) ||
      Object.keys(email).some((key) => !(emailPreferenceKeys as readonly string[]).includes(key)) ||
      notificationPreferenceKeys.some((key) => typeof inApp[key] !== "boolean") ||
      emailPreferenceKeys.some((key) => typeof email[key] !== "boolean")) return null;
  return normalizeNotificationPreferences(value);
}
