import { NextResponse } from "next/server";

import { CustomFieldAuthError } from "@/lib/custom-field-route-auth";
import { MeetingUpdateError, updateMeeting } from "@/lib/meeting-update";
import { drainMeetingNotificationOutbox } from "@/lib/meeting-notification-outbox";

type Context = { params: Promise<{ workspaceId: string; meetingId: string }> };

export async function PATCH(request: Request, context: Context) {
  const { workspaceId, meetingId } = await context.params;
  try {
    const body = await request.json().catch(() => null);
    await updateMeeting(request, workspaceId, meetingId, body);
    const notifications = await drainMeetingNotificationOutbox(meetingId);
    return NextResponse.json({ success: true, notificationWarnings: notifications.failed });
  } catch (error) {
    if (error instanceof CustomFieldAuthError || error instanceof MeetingUpdateError) {
      return NextResponse.json({ success: false, message: error.message, code: "code" in error ? error.code : "authorization_failed" }, { status: error.status });
    }
    console.error("Meeting update failed", error);
    return NextResponse.json({ success: false, message: "Meeting changes could not be saved." }, { status: 503 });
  }
}
