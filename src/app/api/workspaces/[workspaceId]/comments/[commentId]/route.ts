import { NextResponse } from "next/server";

import { CustomFieldAuthError } from "@/lib/custom-field-route-auth";
import { deleteComment, updateComment } from "@/lib/comment-service";

type Context = { params: Promise<{ workspaceId: string; commentId: string }> };

export async function PATCH(request: Request, context: Context) {
  try {
    const { workspaceId, commentId } = await context.params;
    const body = await request.json() as { body?: unknown; mentionedUserIds?: unknown };
    await updateComment(request, workspaceId, commentId, body.body, body.mentionedUserIds);
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof CustomFieldAuthError) return NextResponse.json({ success: false, message: error.message }, { status: error.status });
    return NextResponse.json({ success: false, message: "Comment could not be updated." }, { status: 500 });
  }
}

export async function DELETE(request: Request, context: Context) {
  try {
    const { workspaceId, commentId } = await context.params;
    await deleteComment(request, workspaceId, commentId);
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof CustomFieldAuthError) return NextResponse.json({ success: false, message: error.message }, { status: error.status });
    return NextResponse.json({ success: false, message: "Comment could not be deleted." }, { status: 500 });
  }
}
