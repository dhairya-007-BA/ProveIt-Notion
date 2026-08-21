import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const state: Record<string, unknown> = {};
  const ref = { id: "event-1" };
  const document = { id: "event-1", ref, data: () => state };
  const get = vi.fn(async () => ({ docs: [document] }));
  const query = { get, limit: () => query };
  let queue = Promise.resolve();
  const runTransaction = <T>(callback: (transaction: { get: (target: unknown) => Promise<unknown>; update: (target: unknown, fields: Record<string, unknown>) => void }) => Promise<T>) => {
    const result = queue.then(() => callback({ get: async () => ({ exists: true, data: () => state }), update: (_target, fields) => Object.assign(state, fields) }));
    queue = result.then(() => undefined, () => undefined);
    return result;
  };
  return { state, query, runTransaction, resetQueue: () => { queue = Promise.resolve(); } };
});

const dispatch = vi.hoisted(() => vi.fn());

vi.mock("firebase-admin/firestore", () => ({ FieldValue: { serverTimestamp: () => "server-time", increment: () => 1 }, Timestamp: { fromMillis: (value: number) => ({ toMillis: () => value }) } }));
vi.mock("@/lib/firebase-admin", () => ({ adminDb: { collection: () => ({ where: () => mocks.query }), runTransaction: mocks.runTransaction } }));
vi.mock("@/lib/notification-service", () => ({ dispatchCanonicalNotification: dispatch }));

import { drainMeetingNotificationOutbox, drainPendingMeetingNotificationEvents } from "@/lib/meeting-notification-outbox";

describe("meeting notification transactional outbox", () => {
  beforeEach(() => {
    vi.clearAllMocks(); mocks.resetQueue();
    Object.keys(mocks.state).forEach((key) => delete mocks.state[key]);
    Object.assign(mocks.state, { status: "pending", attempts: 0, event: { eventId: "event-1" } });
  });

  it("keeps a failed event pending and delivers it on a later API replay", async () => {
    dispatch.mockRejectedValueOnce(new Error("temporary delivery failure"));
    await expect(drainMeetingNotificationOutbox("meeting-1")).resolves.toMatchObject({ attempted: 1, failed: 1 });
    expect(mocks.state).toMatchObject({ status: "pending", lastError: "delivery_failed" });
    dispatch.mockResolvedValueOnce({ notificationCreated: true });
    await expect(drainMeetingNotificationOutbox("meeting-1")).resolves.toMatchObject({ attempted: 1, failed: 0 });
    expect(mocks.state).toMatchObject({ status: "delivered", lastError: null });
  });

  it("leases an event so concurrent route and scheduler drains dispatch it once", async () => {
    dispatch.mockResolvedValue({ notificationCreated: true });
    const [route, scheduler] = await Promise.all([drainMeetingNotificationOutbox("meeting-1"), drainPendingMeetingNotificationEvents(10)]);
    expect(route.attempted + scheduler.attempted).toBe(1);
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(mocks.state.status).toBe("delivered");
  });
});
