import "server-only";

import { Timestamp, type DocumentReference, type Firestore } from "firebase-admin/firestore";

import { adminDb } from "@/lib/firebase-admin";
import { DISPOSABLE_KANEO_TEST_MARKER } from "@/lib/kaneo-task-create";

export const DISPOSABLE_KANEO_TEST_MAPPING_ID =
  "__proveit_kaneo_disposable_test_business_v1__";
export const DISPOSABLE_KANEO_TEST_IDEMPOTENCY_KEY =
  "proveit-kaneo-disposable-test-business-v1";

export type KaneoIntegrationState =
  | "pending"
  | "linked"
  | "reconciliation_required"
  | "failed";

export type KaneoIntegrationErrorCategory =
  | "timeout"
  | "upstream_4xx"
  | "upstream_5xx"
  | "malformed_response"
  | "mapping_write_failed"
  | "ambiguous_result";

export type KaneoIntegrationRecord = {
  provider: "kaneo";
  proveItTaskId: string;
  proveItWorkspaceId: "business" | "technology";
  kaneoProjectId: string;
  state: KaneoIntegrationState;
  idempotencyKey: string;
  reconciliationMarker: string;
  kaneoTaskId?: string;
  attemptCount: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  lastAttemptAt: Timestamp;
  lastErrorCategory?: KaneoIntegrationErrorCategory;
};

type IntegrationStore = Pick<Firestore, "collection" | "runTransaction">;

function mappingReference(store: IntegrationStore) {
  return store
    .collection("kaneoTaskIntegrations")
    .doc(DISPOSABLE_KANEO_TEST_MAPPING_ID) as DocumentReference<KaneoIntegrationRecord>;
}

function isState(value: unknown): value is KaneoIntegrationState {
  return value === "pending" || value === "linked" ||
    value === "reconciliation_required" || value === "failed";
}

function recordFromUnknown(value: unknown): KaneoIntegrationRecord | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (record.provider !== "kaneo" || typeof record.proveItTaskId !== "string" ||
    (record.proveItWorkspaceId !== "business" && record.proveItWorkspaceId !== "technology") ||
    typeof record.kaneoProjectId !== "string" || !isState(record.state) ||
    typeof record.idempotencyKey !== "string" ||
    typeof record.reconciliationMarker !== "string" ||
    typeof record.attemptCount !== "number") return null;

  return record as unknown as KaneoIntegrationRecord;
}

export async function reserveDisposableKaneoTest(
  kaneoProjectId: string,
  options: { store?: IntegrationStore; now?: () => Timestamp } = {}
) {
  const store = options.store ?? adminDb;
  const now = options.now ?? Timestamp.now;
  const reference = mappingReference(store);

  return store.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(reference);
    if (snapshot.exists) {
      const record = recordFromUnknown(snapshot.data());
      return { canCreate: false as const, state: record?.state ?? "reconciliation_required" };
    }

    const timestamp = now();
    const record: KaneoIntegrationRecord = {
      provider: "kaneo",
      proveItTaskId: DISPOSABLE_KANEO_TEST_MAPPING_ID,
      proveItWorkspaceId: "business",
      kaneoProjectId,
      state: "pending",
      idempotencyKey: DISPOSABLE_KANEO_TEST_IDEMPOTENCY_KEY,
      reconciliationMarker: DISPOSABLE_KANEO_TEST_MARKER,
      attemptCount: 0,
      createdAt: timestamp,
      updatedAt: timestamp,
      lastAttemptAt: timestamp,
    };

    transaction.create(reference, record);
    return { canCreate: true as const, state: "pending" as const };
  });
}

export async function markDisposableKaneoTestAttempt(
  options: { store?: IntegrationStore; now?: () => Timestamp } = {}
) {
  const store = options.store ?? adminDb;
  const reference = mappingReference(store);
  const timestamp = (options.now ?? Timestamp.now)();
  await reference.update({
    attemptCount: 1,
    lastAttemptAt: timestamp,
    updatedAt: timestamp,
  });
}

export async function linkDisposableKaneoTest(
  kaneoTaskId: string,
  options: { store?: IntegrationStore; now?: () => Timestamp } = {}
) {
  const store = options.store ?? adminDb;
  const reference = mappingReference(store);
  await reference.update({
    state: "linked",
    kaneoTaskId,
    updatedAt: (options.now ?? Timestamp.now)(),
  });
}

export async function requireDisposableKaneoTestReconciliation(
  category: KaneoIntegrationErrorCategory,
  options: { store?: IntegrationStore; now?: () => Timestamp } = {}
) {
  const store = options.store ?? adminDb;
  const reference = mappingReference(store);
  await reference.update({
    state: "reconciliation_required",
    lastErrorCategory: category,
    updatedAt: (options.now ?? Timestamp.now)(),
  });
}

export async function failDisposableKaneoTest(
  category: Extract<KaneoIntegrationErrorCategory, "upstream_4xx" | "upstream_5xx">,
  options: { store?: IntegrationStore; now?: () => Timestamp } = {}
) {
  const store = options.store ?? adminDb;
  const reference = mappingReference(store);
  await reference.update({
    state: "failed",
    lastErrorCategory: category,
    updatedAt: (options.now ?? Timestamp.now)(),
  });
}
