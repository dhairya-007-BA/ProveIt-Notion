import { NextResponse } from "next/server";

import { CustomFieldAuthError } from "@/lib/custom-field-route-auth";
import { createMeeting, MeetingUpdateError } from "@/lib/meeting-update";
import { drainMeetingNotificationOutbox } from "@/lib/meeting-notification-outbox";

type Context = { params: Promise<{ workspaceId: string }> };

export async function POST(request: Request, context: Context) {
  const { workspaceId } = await context.params;
  try {
    const result = await createMeeting(request, workspaceId, await request.json().catch(() => null));
    const notifications = await drainMeetingNotificationOutbox(result.meetingId);
    return NextResponse.json({ success: true, meetingId: result.meetingId, notificationWarnings: notifications.failed }, { status: 201 });
  } catch (error) {
    if (error instanceof CustomFieldAuthError || error instanceof MeetingUpdateError) {
      return NextResponse.json({ success: false, message: error.message, code: "code" in error ? error.code : "authorization_failed" }, { status: error.status });
    }
    console.error("Meeting creation failed", error);
    return NextResponse.json({ success: false, message: "Meeting could not be created." }, { status: 503 });
  }
}
