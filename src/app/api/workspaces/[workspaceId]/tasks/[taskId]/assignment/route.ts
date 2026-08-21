import { NextResponse } from "next/server";

import { CustomFieldAuthError, requireCustomFieldWorkspaceUser } from "@/lib/custom-field-route-auth";
import { TaskAssignmentNotificationError, updateTaskAssignment } from "@/lib/task-assignment-notification";

type Context = { params: Promise<{ workspaceId: string; taskId: string }> };

export async function PATCH(request: Request, context: Context) {
  const { workspaceId, taskId } = await context.params;
  try {
    const actor = await requireCustomFieldWorkspaceUser(request, workspaceId);
    const input = await request.json().catch(() => null) as { assigneeId?: unknown } | null;
    const result = await updateTaskAssignment(workspaceId, taskId, actor.uid, input?.assigneeId);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    if (error instanceof CustomFieldAuthError || error instanceof TaskAssignmentNotificationError) {
      return NextResponse.json({ success: false, message: error.message }, { status: error.status });
    }
    console.error("Task assignment update failed", error);
    return NextResponse.json({ success: false, message: "Task assignment could not be updated." }, { status: 503 });
  }
}
