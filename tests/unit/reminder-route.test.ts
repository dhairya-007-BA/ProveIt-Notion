import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const dispatchDueAndMeetingReminders = vi.hoisted(() => vi.fn());
const drainPendingTaskAssignmentEvents = vi.hoisted(() => vi.fn());
const drainPendingMeetingNotificationEvents = vi.hoisted(() => vi.fn());
vi.mock("@/lib/reminder-dispatcher", () => ({ dispatchDueAndMeetingReminders }));
vi.mock("@/lib/task-assignment-notification", () => ({ drainPendingTaskAssignmentEvents }));
vi.mock("@/lib/meeting-notification-outbox", () => ({ drainPendingMeetingNotificationEvents }));

import { POST } from "@/app/api/internal/reminders/route";

function request(secret?: string) {
  return new Request("http://localhost/api/internal/reminders", { method: "POST", headers: secret ? { Authorization: `Bearer ${secret}` } : {} });
}

describe("reminder dispatch route", () => {
  const originalSecret = process.env.REMINDER_DISPATCH_SECRET;
  beforeEach(() => {
    vi.clearAllMocks();
    dispatchDueAndMeetingReminders.mockResolvedValue({ events: 0, processed: 0, notificationCreated: 0, email: { sent: 0, suppressed: 0, unavailable: 0, failed: 0, duplicate: 0 }, eventFailures: 0 });
    drainPendingTaskAssignmentEvents.mockResolvedValue({ processed: 0 });
    drainPendingMeetingNotificationEvents.mockResolvedValue({ processed: 0 });
  });
  afterEach(() => { if (originalSecret === undefined) delete process.env.REMINDER_DISPATCH_SECRET; else process.env.REMINDER_DISPATCH_SECRET = originalSecret; });

  it("is unavailable rather than open when its server secret is missing", async () => {
    delete process.env.REMINDER_DISPATCH_SECRET;
    const response = await POST(request());
    expect(response.status).toBe(503);
    expect(dispatchDueAndMeetingReminders).not.toHaveBeenCalled();
  });

  it("rejects a missing or forged secret", async () => {
    process.env.REMINDER_DISPATCH_SECRET = "configured-secret";
    expect((await POST(request())).status).toBe(401);
    expect((await POST(request("wrong-secret"))).status).toBe(401);
    expect(dispatchDueAndMeetingReminders).not.toHaveBeenCalled();
  });

  it("runs only after constant-time server-secret authentication", async () => {
    process.env.REMINDER_DISPATCH_SECRET = "configured-secret";
    const response = await POST(request("configured-secret"));
    expect(response.status).toBe(200);
    expect(dispatchDueAndMeetingReminders).toHaveBeenCalledTimes(1);
    expect(drainPendingTaskAssignmentEvents).toHaveBeenCalledTimes(1);
    expect(drainPendingMeetingNotificationEvents).toHaveBeenCalledTimes(1);
  });
});
