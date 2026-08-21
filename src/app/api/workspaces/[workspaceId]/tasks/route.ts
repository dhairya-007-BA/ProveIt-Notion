import { NextResponse } from "next/server";

import { CustomFieldAuthError, requireCustomFieldWorkspaceUser } from "@/lib/custom-field-route-auth";
import { createTaskWithAssignmentEvent, TaskAssignmentNotificationError } from "@/lib/task-assignment-notification";

type Context = { params: Promise<{ workspaceId: string }> };

export async function POST(request: Request, context: Context) {
  const { workspaceId } = await context.params;
  try {
    const actor = await requireCustomFieldWorkspaceUser(request, workspaceId);
    const result = await createTaskWithAssignmentEvent(workspaceId, actor.uid, await request.json().catch(() => null));
    return NextResponse.json({ success: true, taskId: result.taskId, notificationWarning: result.notificationWarning }, { status: 201 });
  } catch (error) {
    if (error instanceof CustomFieldAuthError || error instanceof TaskAssignmentNotificationError) {
      return NextResponse.json({ success: false, message: error.message }, { status: error.status });
    }
    console.error("Task creation failed", error);
    return NextResponse.json({ success: false, message: "Task could not be created." }, { status: 503 });
  }
}
