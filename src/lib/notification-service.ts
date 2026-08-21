import "server-only";

import { FieldValue, Timestamp } from "firebase-admin/firestore";

import { adminDb } from "@/lib/firebase-admin";
import { normalizeNotificationPreferences, type EmailPreferenceKey, type InAppPreferenceKey } from "@/lib/notification-preferences";
import { sendProveItEmail, type EmailDeliveryResult } from "@/lib/proveit-email";

export const notificationEventTypes = [
  "mention",
  "reply",
  "task_assignment",
  "task_reassignment",
  "task_due_reminder",
  "task_overdue",
  "meeting_invitation",
  "meeting_reminder",
] as const;

export type NotificationEventType = (typeof notificationEventTypes)[number];
export type NotificationEntityType = "task" | "meeting" | "document" | "database-row";

export type CanonicalNotificationEvent = {
  /** Stable, caller-owned idempotency key. Use the source entity/event id plus recipient uid. */
  eventId: string;
  workspaceId: string;
  recipientUid: string;
  actorUid: string | null;
  eventType: NotificationEventType;
  entityType: NotificationEntityType;
  entityId: string;
  title: string;
  message: string;
  commentId?: string;
};

type NotificationWrite = { id: string; data: Record<string, unknown> };
type EmailPlan = { id: string; recipientEmail: string | null; subject: string; heading: string; body: string; actionLabel: string; actionUrl: string };

export type PreparedCanonicalNotification = {
  event: CanonicalNotificationEvent;
  notification: NotificationWrite | null;
  email: EmailPlan | null;
};

const preferenceByEvent: Record<NotificationEventType, { inApp: InAppPreferenceKey; email: EmailPreferenceKey }> = {
  mention: { inApp: "mentions", email: "mentions" },
  reply: { inApp: "replies", email: "replies" },
  task_assignment: { inApp: "assignments", email: "taskAssignments" },
  task_reassignment: { inApp: "assignments", email: "taskAssignments" },
  task_due_reminder: { inApp: "reminders", email: "taskReminders" },
  task_overdue: { inApp: "reminders", email: "taskReminders" },
  meeting_invitation: { inApp: "assignments", email: "meetingInvitations" },
  meeting_reminder: { inApp: "reminders", email: "meetingReminders" },
};

function requiredString(value: string, label: string, max = 500) {
  const normalized = value.trim();
  if (!normalized || normalized.length > max || /[\u0000-\u001F\u007F]/.test(normalized)) throw new Error(`Invalid ${label}.`);
  return normalized;
}

function recipientEmail(value: unknown) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length <= 320 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) && !/[\u0000-\u001F\u007F]/.test(normalized) ? normalized : null;
}

function entityHref(event: CanonicalNotificationEvent) {
  const workspace = encodeURIComponent(event.workspaceId);
  const entity = encodeURIComponent(event.entityId);
  if (event.entityType === "task") return `/workspaces/${workspace}/tasks?task=${entity}`;
  if (event.entityType === "meeting") return `/workspaces/${workspace}/meetings/${entity}`;
  if (event.entityType === "document") return `/workspaces/${workspace}/documents/${entity}`;
  const [databaseId, rowId] = event.entityId.split(":", 2);
  if (!databaseId || !rowId) throw new Error("Invalid database row notification target.");
  return `/workspaces/${workspace}/databases/${encodeURIComponent(databaseId)}/rows/${encodeURIComponent(rowId)}`;
}

function validateEvent(event: CanonicalNotificationEvent) {
  if (!/^[A-Za-z0-9_-]{1,180}$/.test(event.eventId)) throw new Error("Invalid notification event id.");
  requiredString(event.workspaceId, "workspace id", 120);
  requiredString(event.recipientUid, "notification recipient", 128);
  if (event.actorUid !== null) requiredString(event.actorUid, "notification actor", 128);
  if (!(notificationEventTypes as readonly string[]).includes(event.eventType)) throw new Error("Invalid notification event type.");
  requiredString(event.entityId, "notification entity", 500);
  requiredString(event.title, "notification title", 120);
  requiredString(event.message, "notification message", 500);
  if (event.commentId !== undefined) requiredString(event.commentId, "comment id", 128);
}

/**
 * Validates recipient/workspace eligibility and resolves legacy-safe preferences.
 * Producers may add `notification` to an existing batch, commit their domain
 * mutation, then call `deliverPreparedCanonicalNotification` for optional email.
 */
export async function prepareCanonicalNotification(event: CanonicalNotificationEvent): Promise<PreparedCanonicalNotification> {
  validateEvent(event);
  const [recipient, membership, workspace] = await Promise.all([
    adminDb.collection("users").doc(event.recipientUid).get(),
    adminDb.collection("workspaceMemberships").doc(`${event.workspaceId}_${event.recipientUid}`).get(),
    adminDb.collection("workspaces").doc(event.workspaceId).get(),
  ]);
  const profile = recipient.data();
  const capabilities = profile?.capabilities;
  const hasExplicitCapabilities = capabilities && typeof capabilities === "object" && Object.keys(capabilities).length > 0;
  const legacyBod = (profile?.role === "bod" || profile?.group === "bod") && !hasExplicitCapabilities;
  const globalManager = capabilities && typeof capabilities === "object" && (capabilities as Record<string, unknown>).manageWorkspaces === true;
  const activeMember = membership.exists && membership.data()?.active === true;
  const companyEmployee = event.workspaceId === "company" && profile?.active === true;
  if (!recipient.exists || profile?.active !== true || !workspace.exists || workspace.data()?.active !== true || workspace.data()?.deletedAt || !(companyEmployee || activeMember || legacyBod || globalManager)) {
    throw new Error("Notification recipient does not have access to this workspace.");
  }
  const preferences = normalizeNotificationPreferences(profile.notificationPreferences);
  const keys = preferenceByEvent[event.eventType];
  const href = entityHref(event);
  const data = {
    workspaceId: event.workspaceId,
    recipientUid: event.recipientUid,
    actorUid: event.actorUid,
    eventType: event.eventType,
    entityType: event.entityType,
    entityId: event.entityId,
    ...(event.commentId ? { commentId: event.commentId } : {}),
    title: event.title.trim(),
    message: event.message.trim(),
    readAt: null,
    archivedAt: null,
    createdAt: FieldValue.serverTimestamp(),
  };
  return {
    event,
    notification: preferences.inApp[keys.inApp] ? { id: event.eventId, data } : null,
    email: preferences.email[keys.email] ? {
      id: `email_${event.eventId}`,
      recipientEmail: recipientEmail(profile.email),
      subject: event.title.trim(),
      heading: event.title.trim(),
      body: event.message.trim(),
      actionLabel: event.entityType === "task" ? "Open task" : event.entityType === "meeting" ? "Open meeting" : "Open in ProveIt",
      actionUrl: href,
    } : null,
  };
}

async function reserveEmailDelivery(plan: EmailPlan, event: CanonicalNotificationEvent) {
  const ref = adminDb.collection("emailDeliveries").doc(plan.id);
  const now = new Date();
  const leaseExpiresAt = Timestamp.fromDate(new Date(now.getTime() + 5 * 60 * 1000));
  return adminDb.runTransaction(async (transaction) => {
    const existing = await transaction.get(ref);
    const existingData = existing.data();
    if (existing.exists && existingData?.status === "sent") return false;
    const existingLease = existingData?.leaseExpiresAt && typeof existingData.leaseExpiresAt.toDate === "function" ? existingData.leaseExpiresAt.toDate() as Date : existingData?.leaseExpiresAt instanceof Date ? existingData.leaseExpiresAt : null;
    if (existing.exists && existingData?.status === "pending" && existingLease && existingLease.getTime() > now.getTime()) return false;
    const attemptCount = typeof existingData?.attemptCount === "number" && Number.isFinite(existingData.attemptCount) ? existingData.attemptCount + 1 : 1;
    transaction.set(ref, {
      eventId: event.eventId,
      workspaceId: event.workspaceId,
      recipientUid: event.recipientUid,
      eventType: event.eventType,
      entityType: event.entityType,
      entityId: event.entityId,
      status: "pending",
      provider: "resend",
      attemptCount,
      leaseExpiresAt,
      lastAttemptAt: FieldValue.serverTimestamp(),
      ...(existing.exists ? {} : { createdAt: FieldValue.serverTimestamp() }),
      reason: FieldValue.delete(),
      providerStatus: FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    return true;
  });
}

function deliveryFields(result: EmailDeliveryResult) {
  return result.status === "sent"
    ? { status: "sent", providerMessageId: result.providerMessageId, sentAt: FieldValue.serverTimestamp(), leaseExpiresAt: FieldValue.delete() }
    : { status: result.status, reason: result.reason, ...(result.status === "failed" && result.providerStatus ? { providerStatus: result.providerStatus } : {}) };
}

export async function deliverPreparedCanonicalNotification(prepared: PreparedCanonicalNotification) {
  if (!prepared.email) return { status: "suppressed" as const };
  if (!(await reserveEmailDelivery(prepared.email, prepared.event))) return { status: "duplicate" as const };
  const ref = adminDb.collection("emailDeliveries").doc(prepared.email.id);
  if (!prepared.email.recipientEmail) {
    await ref.update({ status: "unavailable", reason: "missing_recipient_email", leaseExpiresAt: FieldValue.delete(), updatedAt: FieldValue.serverTimestamp() });
    return { status: "unavailable" as const, reason: "missing_recipient_email" as const };
  }
  const result = await sendProveItEmail({
    to: prepared.email.recipientEmail,
    subject: prepared.email.subject,
    preview: prepared.email.body,
    heading: prepared.email.heading,
    body: prepared.email.body,
    actionLabel: prepared.email.actionLabel,
    actionUrl: prepared.email.actionUrl,
    idempotencyKey: prepared.email.id,
  });
  await ref.update({ ...deliveryFields(result), ...(result.status === "sent" ? {} : { leaseExpiresAt: FieldValue.delete() }), updatedAt: FieldValue.serverTimestamp() });
  if (result.status !== "sent") console.warn("Transactional email was not delivered", { deliveryId: prepared.email.id, eventType: prepared.event.eventType, status: result.status, reason: result.reason });
  return result;
}

/** Complete server-side path for producers that do not need a shared batch. */
export async function dispatchCanonicalNotification(event: CanonicalNotificationEvent) {
  const prepared = await prepareCanonicalNotification(event);
  let notificationCreated = false;
  if (prepared.notification) {
    const ref = adminDb.collection("notifications").doc(prepared.notification.id);
    notificationCreated = await adminDb.runTransaction(async (transaction) => {
      const existing = await transaction.get(ref);
      if (existing.exists) return false;
      transaction.set(ref, prepared.notification!.data);
      return true;
    });
  }
  const email = await deliverPreparedCanonicalNotification(prepared);
  return { notificationCreated, email };
}
