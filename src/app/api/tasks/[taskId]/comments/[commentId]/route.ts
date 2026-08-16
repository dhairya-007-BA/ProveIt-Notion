import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";
import { CustomFieldAuthError, requireCustomFieldWorkspaceUser } from "@/lib/custom-field-route-auth";

type Context = { params: Promise<{ taskId: string; commentId: string }> };
const MAX_COMMENT_LENGTH = 4000;

async function authorizedComment(request: Request, context: Context) {
  const { taskId, commentId } = await context.params;
  const [task, comment] = await Promise.all([adminDb.collection("tasks").doc(taskId).get(), adminDb.collection("comments").doc(commentId).get()]);
  if (!task.exists || !comment.exists || task.data()?.workspaceId !== comment.data()?.workspaceId || comment.data()?.entityType !== "task" || comment.data()?.entityId !== taskId) throw new CustomFieldAuthError("Comment not found.", 404);
  const actor = await requireCustomFieldWorkspaceUser(request, task.data()!.workspaceId as string);
  if (comment.data()?.authorUid !== actor.uid) throw new CustomFieldAuthError("You can only change your own comments.", 403);
  return comment.ref;
}

export async function PATCH(request: Request, context: Context) {
  try {
    const body = await request.json() as { body?: unknown };
    const text = typeof body.body === "string" ? body.body.trim() : "";
    if (Object.keys(body).length !== 1 || !text || text.length > MAX_COMMENT_LENGTH) return NextResponse.json({ success: false, message: "Comment must be between 1 and 4,000 characters." }, { status: 400 });
    const comment = await authorizedComment(request, context);
    await comment.update({ body: text, updatedAt: FieldValue.serverTimestamp(), editedAt: FieldValue.serverTimestamp() });
    return NextResponse.json({ success: true });
  } catch (error) { if (error instanceof CustomFieldAuthError) return NextResponse.json({ success: false, message: error.message }, { status: error.status }); return NextResponse.json({ success: false, message: "Comment could not be updated." }, { status: 500 }); }
}

export async function DELETE(request: Request, context: Context) {
  try { const comment = await authorizedComment(request, context); await comment.delete(); return NextResponse.json({ success: true }); }
  catch (error) { if (error instanceof CustomFieldAuthError) return NextResponse.json({ success: false, message: error.message }, { status: error.status }); return NextResponse.json({ success: false, message: "Comment could not be deleted." }, { status: 500 }); }
}
