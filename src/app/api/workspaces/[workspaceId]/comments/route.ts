import { NextResponse } from "next/server";

import { CustomFieldAuthError } from "@/lib/custom-field-route-auth";
import { createComment, parseCommentTarget } from "@/lib/comment-service";

type Context = { params: Promise<{ workspaceId: string }> };

export async function POST(request: Request, context: Context) {
  try {
    const { workspaceId } = await context.params;
    const input = await request.json() as Record<string, unknown>;
    const target = parseCommentTarget(input);
    const comment = await createComment(request, workspaceId, target.entityType, target.entityId, { body: input.body, parentCommentId: input.parentCommentId, mentionedUserIds: input.mentionedUserIds });
    return NextResponse.json({ success: true, commentId: comment.id }, { status: 201 });
  } catch (error) {
    if (error instanceof CustomFieldAuthError) return NextResponse.json({ success: false, message: error.message }, { status: error.status });
    return NextResponse.json({ success: false, message: "Comment could not be posted." }, { status: 500 });
  }
}
