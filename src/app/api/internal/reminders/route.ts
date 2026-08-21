import "server-only";

import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { dispatchDueAndMeetingReminders } from "@/lib/reminder-dispatcher";
import { drainPendingTaskAssignmentEvents } from "@/lib/task-assignment-notification";
import { drainPendingMeetingNotificationEvents } from "@/lib/meeting-notification-outbox";

function authorized(request: Request) {
  const configured = process.env.REMINDER_DISPATCH_SECRET;
  if (!configured) return { ok: false as const, status: 503, message: "Reminder dispatch is not configured." };
  const authorization = request.headers.get("authorization");
  const supplied = authorization?.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  const expectedBuffer = Buffer.from(configured);
  const suppliedBuffer = Buffer.from(supplied);
  if (!supplied || expectedBuffer.length !== suppliedBuffer.length || !timingSafeEqual(expectedBuffer, suppliedBuffer)) return { ok: false as const, status: 401, message: "Reminder dispatch authentication failed." };
  return { ok: true as const };
}

async function run(request: Request) {
  const authorization = authorized(request);
  if (!authorization.ok) return NextResponse.json({ success: false, message: authorization.message }, { status: authorization.status });
  try {
    const [reminders, taskAssignments, meetingNotifications] = await Promise.all([
      dispatchDueAndMeetingReminders(),
      drainPendingTaskAssignmentEvents(),
      drainPendingMeetingNotificationEvents(),
    ]);
    return NextResponse.json({ success: true, result: { reminders, taskAssignments, meetingNotifications } });
  } catch (error) {
    console.error("Reminder dispatch failed", { errorCategory: error instanceof Error ? error.name : "unknown" });
    return NextResponse.json({ success: false, message: "Reminder dispatch could not be completed." }, { status: 503 });
  }
}

export async function GET(request: Request) { return run(request); }
export async function POST(request: Request) { return run(request); }
