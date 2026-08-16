import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";
import { CustomFieldAuthError, requireCustomFieldWorkspaceUser } from "@/lib/custom-field-route-auth";

type Context = { params: Promise<{ taskId: string }> };
const MAX_COMMENT_LENGTH = 4000;

export async function POST(request: Request, context: Context) {
  try {
    const { taskId } = await context.params;
    const body = await request.json() as { body?: unknown };
    if (Object.keys(body).length !== 1 || typeof body.body !== "string") return NextResponse.json({ success: false, message: "Invalid comment." }, { status: 400 });
    const text = body.body.trim();
    if (!text || text.length > MAX_COMMENT_LENGTH) return NextResponse.json({ success: false, message: "Comment must be between 1 and 4,000 characters." }, { status: 400 });
    const task = await adminDb.collection("tasks").doc(taskId).get();
    if (!task.exists || typeof task.data()?.workspaceId !== "string") return NextResponse.json({ success: false, message: "Task not found." }, { status: 404 });
    const workspaceId = task.data()!.workspaceId as string;
    const actor = await requireCustomFieldWorkspaceUser(request, workspaceId);
    const profile = await adminDb.collection("users").doc(actor.uid).get();
    const comment = adminDb.collection("comments").doc();
    await comment.set({ workspaceId, entityType: "task", entityId: taskId, authorUid: actor.uid, authorName: profile.data()?.name || "Employee", body: text, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    return NextResponse.json({ success: true, commentId: comment.id }, { status: 201 });
  } catch (error) {
    if (error instanceof CustomFieldAuthError) return NextResponse.json({ success: false, message: error.message }, { status: error.status });
    return NextResponse.json({ success: false, message: "Comment could not be posted." }, { status: 500 });
  }
}
