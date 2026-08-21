import "server-only";

import { randomUUID } from "node:crypto";

import { FieldValue, Timestamp, type Transaction } from "firebase-admin/firestore";

import { adminDb } from "@/lib/firebase-admin";
import { dispatchCanonicalNotification, type CanonicalNotificationEvent } from "@/lib/notification-service";

export function enqueueMeetingNotification(transaction: Transaction, meetingId: string, event: CanonicalNotificationEvent) {
  transaction.create(adminDb.collection("meetingNotificationOutbox").doc(event.eventId), {
    meetingId,
    workspaceId: event.workspaceId,
    event,
    status: "pending",
    attempts: 0,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
}

const LEASE_MS = 5 * 60 * 1000;
const MAX_GLOBAL_DRAIN = 100;

function millis(value: unknown) {
  if (value && typeof value === "object" && "toMillis" in value && typeof value.toMillis === "function") return (value as { toMillis: () => number }).toMillis();
  if (value instanceof Date) return value.getTime();
  return 0;
}

async function claim(document: FirebaseFirestore.QueryDocumentSnapshot) {
  const token = randomUUID();
  const now = Date.now();
  return adminDb.runTransaction(async (transaction) => {
    const current = await transaction.get(document.ref);
    const data = current.data();
    if (!current.exists || data?.status === "delivered" || (data?.status === "processing" && millis(data.leaseExpiresAt) > now)) return null;
    const event = data?.event as CanonicalNotificationEvent | undefined;
    if (!event || typeof event.eventId !== "string") return null;
    transaction.update(document.ref, {
      status: "processing",
      leaseToken: token,
      leaseExpiresAt: Timestamp.fromMillis(now + LEASE_MS),
      attempts: FieldValue.increment(1),
      updatedAt: FieldValue.serverTimestamp(),
    });
    return { event, token };
  });
}

async function finish(document: FirebaseFirestore.QueryDocumentSnapshot, token: string, delivered: boolean) {
  await adminDb.runTransaction(async (transaction) => {
    const current = await transaction.get(document.ref);
    if (!current.exists || current.data()?.leaseToken !== token || current.data()?.status !== "processing") return;
    transaction.update(document.ref, delivered
      ? { status: "delivered", deliveredAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(), leaseToken: null, leaseExpiresAt: null, lastError: null }
      : { status: "pending", updatedAt: FieldValue.serverTimestamp(), leaseToken: null, leaseExpiresAt: null, lastError: "delivery_failed" });
  });
}

async function drainDocuments(documents: FirebaseFirestore.QueryDocumentSnapshot[]) {
  const outcomes = await Promise.all(documents.map(async (document) => {
    const claimed = await claim(document);
    if (!claimed) return null;
    try {
      await dispatchCanonicalNotification(claimed.event);
      await finish(document, claimed.token, true);
      return true;
    } catch (error) {
      console.error("Meeting notification outbox delivery failed", { outboxId: document.id, error: error instanceof Error ? error.message : "unknown" });
      await finish(document, claimed.token, false).catch(() => undefined);
      return false;
    }
  }));
  const attempted = outcomes.filter((outcome) => outcome !== null);
  return { attempted: attempted.length, failed: attempted.filter((delivered) => !delivered).length, skippedLeased: outcomes.filter((outcome) => outcome === null).length };
}

export async function drainMeetingNotificationOutbox(meetingId: string) {
  const snapshot = await adminDb.collection("meetingNotificationOutbox").where("meetingId", "==", meetingId).get();
  return drainDocuments(snapshot.docs.filter((document) => document.data().status === "pending" || document.data().status === "processing"));
}

export async function drainPendingMeetingNotificationEvents(batchSize = MAX_GLOBAL_DRAIN) {
  const limit = Math.min(Math.max(Math.floor(batchSize), 1), MAX_GLOBAL_DRAIN);
  const snapshot = await adminDb.collection("meetingNotificationOutbox").where("status", "in", ["pending", "processing"]).limit(limit).get();
  const result = await drainDocuments(snapshot.docs);
  return { ...result, scanned: snapshot.docs.length, truncated: snapshot.docs.length === limit };
}
