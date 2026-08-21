import { NextResponse } from "next/server";

import { CustomFieldAuthError } from "@/lib/custom-field-route-auth";
import {
  executeMeetingActionItems,
  listMeetingTaskExecutions,
  MeetingExecutionError,
} from "@/lib/meeting-execution";
import { drainMeetingNotificationOutbox } from "@/lib/meeting-notification-outbox";

function responseError(error: unknown) {
  if (error instanceof CustomFieldAuthError || error instanceof MeetingExecutionError) {
    return NextResponse.json({ success: false, message: error.message, code: "code" in error ? error.code : "authorization_failed" }, { status: error.status });
  }
  console.error("Meeting execution request failed", error);
  return NextResponse.json({ success: false, message: "Meeting action items could not be processed." }, { status: 503 });
}

type Context = { params: Promise<{ workspaceId: string; meetingId: string }> };

export async function GET(request: Request, context: Context) {
  const { workspaceId, meetingId } = await context.params;
  try {
    const executions = await listMeetingTaskExecutions(request, workspaceId, meetingId);
    const notifications = await drainMeetingNotificationOutbox(meetingId);
    return NextResponse.json({ success: true, executions, notificationWarnings: notifications.failed });
  } catch (error) {
    return responseError(error);
  }
}

export async function POST(request: Request, context: Context) {
  const { workspaceId, meetingId } = await context.params;
  try {
    const body = await request.json().catch(() => null);
    const result = await executeMeetingActionItems(request, workspaceId, meetingId, body);
    const notifications = await drainMeetingNotificationOutbox(meetingId);
    return NextResponse.json({ success: true, ...result, notificationWarnings: notifications.failed });
  } catch (error) {
    return responseError(error);
  }
}
