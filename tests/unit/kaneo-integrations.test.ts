import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  DISPOSABLE_KANEO_TEST_MAPPING_ID,
  reserveDisposableKaneoTest,
} from "@/lib/kaneo-integrations";

const records = new Map<string, Record<string, unknown>>();
const update = vi.fn();

const store = {
  collection: vi.fn(() => ({
    doc: (id: string) => ({
      id,
      update,
    }),
  })),
  runTransaction: vi.fn(async (callback) => callback({
    get: async (reference: { id: string }) => ({
      exists: records.has(reference.id),
      data: () => records.get(reference.id),
    }),
    create: (reference: { id: string }, value: Record<string, unknown>) => {
      records.set(reference.id, value);
    },
  })),
};

describe("Kaneo disposable integration reservation", () => {
  beforeEach(() => {
    records.clear();
    vi.clearAllMocks();
  });

  it("creates exactly one deterministic pending reservation", async () => {
    const result = await reserveDisposableKaneoTest("business-project", {
      store: store as never,
    });

    expect(result).toEqual({ canCreate: true, state: "pending" });
    expect(records.get(DISPOSABLE_KANEO_TEST_MAPPING_ID)).toMatchObject({
      provider: "kaneo",
      proveItTaskId: DISPOSABLE_KANEO_TEST_MAPPING_ID,
      proveItWorkspaceId: "business",
      kaneoProjectId: "business-project",
      state: "pending",
      attemptCount: 0,
      idempotencyKey: "proveit-kaneo-disposable-test-business-v1",
      reconciliationMarker: "ProveIt integration marker: proveit-kaneo-test-business-v1",
    });
  });

  it.each(["pending", "linked", "reconciliation_required", "failed"] as const)(
    "blocks a second request when the state is %s",
    async (state) => {
      records.set(DISPOSABLE_KANEO_TEST_MAPPING_ID, {
        provider: "kaneo",
        proveItTaskId: DISPOSABLE_KANEO_TEST_MAPPING_ID,
        proveItWorkspaceId: "business",
        kaneoProjectId: "business-project",
        state,
        idempotencyKey: "proveit-kaneo-disposable-test-business-v1",
        reconciliationMarker: "ProveIt integration marker: proveit-kaneo-test-business-v1",
        attemptCount: 1,
      });

      await expect(reserveDisposableKaneoTest("business-project", {
        store: store as never,
      })).resolves.toEqual({ canCreate: false, state });
    }
  );

  it("fails closed for a malformed existing reservation", async () => {
    records.set(DISPOSABLE_KANEO_TEST_MAPPING_ID, { state: "unexpected" });

    await expect(reserveDisposableKaneoTest("business-project", {
      store: store as never,
    })).resolves.toEqual({ canCreate: false, state: "reconciliation_required" });
  });
});
