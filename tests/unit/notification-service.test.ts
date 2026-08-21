import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const documents = new Map<string, Record<string, unknown>>();
  const transactionSet = vi.fn();
  const update = vi.fn();
  const directSet = vi.fn();
  const ref = (path: string) => ({
    path,
    id: path.split("/").at(-1),
    get: async () => ({ exists: documents.has(path), data: () => documents.get(path) }),
    set: directSet,
    update,
  });
  const collection = vi.fn((name: string) => ({ doc: (id: string) => ref(`${name}/${id}`) }));
  const runTransaction = vi.fn(async (callback: (transaction: { get: (value: { path: string }) => Promise<unknown>; set: typeof transactionSet }) => Promise<unknown>) => callback({
    get: async (value) => ({ exists: documents.has(value.path), data: () => documents.get(value.path) }),
    set: transactionSet,
  }));
  return { documents, transactionSet, update, directSet, collection, runTransaction };
});

const sendProveItEmail = vi.hoisted(() => vi.fn(async () => ({ status: "sent", providerMessageId: "resend-1" } as const)));

vi.mock("server-only", () => ({}));
vi.mock("firebase-admin/firestore", () => ({
  FieldValue: { serverTimestamp: () => "server-time", delete: () => "delete-field" },
  Timestamp: { fromDate: (date: Date) => ({ toDate: () => date }) },
}));
vi.mock("@/lib/firebase-admin", () => ({ adminDb: { collection: mocks.collection, runTransaction: mocks.runTransaction } }));
vi.mock("@/lib/proveit-email", () => ({ sendProveItEmail }));

import { deliverPreparedCanonicalNotification, dispatchCanonicalNotification, prepareCanonicalNotification, type CanonicalNotificationEvent } from "@/lib/notification-service";

const event: CanonicalNotificationEvent = {
  eventId: "mention_comment-1_recipient",
  workspaceId: "technology",
  recipientUid: "recipient",
  actorUid: "actor",
  eventType: "mention",
  entityType: "task",
  entityId: "task-1",
  commentId: "comment-1",
  title: "You were mentioned",
  message: "Actor mentioned you in a comment.",
};

function seedEligibleRecipient(notificationPreferences?: unknown) {
  mocks.documents.set("users/recipient", { active: true, email: "recipient@proveit.test", notificationPreferences });
  mocks.documents.set("workspaceMemberships/technology_recipient", { active: true });
  mocks.documents.set("workspaces/technology", { active: true });
}

describe("canonical notification service", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.documents.clear(); seedEligibleRecipient(); });

  it("preserves legacy in-app delivery while optional email stays opt-in", async () => {
    const prepared = await prepareCanonicalNotification(event);
    expect(prepared.notification).toMatchObject({ id: event.eventId, data: { recipientUid: "recipient", eventType: "mention" } });
    expect(prepared.email).toBeNull();
  });

  it("rejects forged recipients without active workspace access", async () => {
    mocks.documents.delete("workspaceMemberships/technology_recipient");
    await expect(prepareCanonicalNotification(event)).rejects.toThrow("does not have access");
  });

  it("allows every active employee to receive Company events without an explicit membership", async () => {
    mocks.documents.set("workspaces/company", { active: true });
    mocks.documents.delete("workspaceMemberships/technology_recipient");
    await expect(prepareCanonicalNotification({ ...event, eventId: "mention_company_recipient", workspaceId: "company" })).resolves.toMatchObject({
      notification: { data: { workspaceId: "company", recipientUid: "recipient" } },
    });
  });

  it("honors channel preferences and reserves one idempotent email delivery", async () => {
    seedEligibleRecipient({ inApp: { mentions: false }, email: { mentions: true } });
    const prepared = await prepareCanonicalNotification(event);
    expect(prepared.notification).toBeNull();
    expect(prepared.email).toMatchObject({ id: `email_${event.eventId}`, recipientEmail: "recipient@proveit.test" });
    await expect(deliverPreparedCanonicalNotification(prepared)).resolves.toEqual({ status: "sent", providerMessageId: "resend-1" });
    expect(mocks.transactionSet).toHaveBeenCalledWith(expect.objectContaining({ path: `emailDeliveries/email_${event.eventId}` }), expect.objectContaining({ status: "pending", attemptCount: 1 }), { merge: true });
    expect(sendProveItEmail).toHaveBeenCalledWith(expect.objectContaining({ idempotencyKey: `email_${event.eventId}` }));
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ status: "sent", providerMessageId: "resend-1" }));
  });

  it("keeps sent deliveries terminal and an active pending lease exclusive", async () => {
    seedEligibleRecipient({ email: { mentions: true } });
    const prepared = await prepareCanonicalNotification(event);
    const path = `emailDeliveries/email_${event.eventId}`;
    mocks.documents.set(path, { status: "sent", attemptCount: 1 });
    await expect(deliverPreparedCanonicalNotification(prepared)).resolves.toEqual({ status: "duplicate" });
    mocks.documents.set(path, { status: "pending", attemptCount: 1, leaseExpiresAt: { toDate: () => new Date(Date.now() + 60_000) } });
    await expect(deliverPreparedCanonicalNotification(prepared)).resolves.toEqual({ status: "duplicate" });
    expect(sendProveItEmail).not.toHaveBeenCalled();
  });

  it.each([
    ["expired pending", { status: "pending", attemptCount: 2, leaseExpiresAt: { toDate: () => new Date(Date.now() - 60_000) } }],
    ["failed", { status: "failed", attemptCount: 2, reason: "provider_unavailable" }],
    ["unavailable", { status: "unavailable", attemptCount: 2, reason: "missing_api_key" }],
  ])("retries %s deliveries under a new lease with the stable provider key", async (_label, delivery) => {
    seedEligibleRecipient({ email: { mentions: true } });
    const prepared = await prepareCanonicalNotification(event);
    mocks.documents.set(`emailDeliveries/email_${event.eventId}`, delivery);
    await expect(deliverPreparedCanonicalNotification(prepared)).resolves.toEqual({ status: "sent", providerMessageId: "resend-1" });
    expect(mocks.transactionSet).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ status: "pending", attemptCount: 3, reason: "delete-field" }), { merge: true });
    expect(sendProveItEmail).toHaveBeenCalledWith(expect.objectContaining({ idempotencyKey: `email_${event.eventId}` }));
  });

  it("does not overwrite an existing notification on event replay", async () => {
    mocks.documents.set(`notifications/${event.eventId}`, { readAt: "already-read" });
    const result = await dispatchCanonicalNotification(event);
    expect(result.notificationCreated).toBe(false);
    expect(mocks.transactionSet).not.toHaveBeenCalled();
    expect(mocks.directSet).not.toHaveBeenCalled();
  });
});
