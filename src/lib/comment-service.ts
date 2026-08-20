import "server-only";

import { FieldValue } from "firebase-admin/firestore";

import { adminDb } from "@/lib/firebase-admin";
import { CustomFieldAuthError, requireCustomFieldWorkspaceUser } from "@/lib/custom-field-route-auth";

export const commentEntityTypes = ["task", "meeting", "document", "database-row"] as const;
export type CommentEntityType = (typeof commentEntityTypes)[number];

const MAX_COMMENT_LENGTH = 4000;
const MAX_MENTIONS = 20;

export type CommentInput = { body: unknown; parentCommentId?: unknown; mentionedUserIds?: unknown };

function validEntityType(value: unknown): value is CommentEntityType {
  return typeof value === "string" && (commentEntityTypes as readonly string[]).includes(value);
}

function asMentionIds(value: unknown) {
  if (value === undefined) return [] as string[];
  if (!Array.isArray(value) || value.length > MAX_MENTIONS || value.some((item) => typeof item !== "string" || !item.trim())) {
    throw new CustomFieldAuthError("Invalid mentioned users.", 403);
  }
  return [...new Set(value.map((item) => item.trim()))];
}

async function requireEntity(workspaceId: string, entityType: CommentEntityType, entityId: string) {
  if (!entityId.trim()) throw new CustomFieldAuthError("Comment target not found.", 404);
  if (entityType === "database-row") {
    const separator = entityId.indexOf(":");
    if (separator < 1 || separator === entityId.length - 1) throw new CustomFieldAuthError("Comment target not found.", 404);
    const databaseId = entityId.slice(0, separator);
    const rowId = entityId.slice(separator + 1);
    const [database, row] = await Promise.all([
      adminDb.collection("databases").doc(databaseId).get(),
      adminDb.collection("databases").doc(databaseId).collection("rows").doc(rowId).get(),
    ]);
    if (!database.exists || !row.exists || database.data()?.workspaceId !== workspaceId) throw new CustomFieldAuthError("Comment target not found.", 404);
    return;
  }
  const collection = entityType === "task" ? "tasks" : entityType === "meeting" ? "meetings" : "documents";
  const entity = await adminDb.collection(collection).doc(entityId).get();
  if (!entity.exists || entity.data()?.workspaceId !== workspaceId) throw new CustomFieldAuthError("Comment target not found.", 404);
}

async function mentionSnapshots(workspaceId: string, mentionIds: string[]) {
  if (!mentionIds.length) return [] as { uid: string; name: string }[];
  const docs = await Promise.all(mentionIds.map(async (uid) => {
    const [profile, membership] = await Promise.all([
      adminDb.collection("users").doc(uid).get(),
      adminDb.collection("workspaceMemberships").doc(`${workspaceId}_${uid}`).get(),
    ]);
    const data = profile.data();
    const activeMember = workspaceId === "company" || (membership.exists && membership.data()?.active === true);
    const legacyBod = (data?.role === "bod" || data?.group === "bod") && (!data?.capabilities || Object.keys(data.capabilities).length === 0);
    const globalManager = data?.capabilities && typeof data.capabilities === "object" && data.capabilities.manageWorkspaces === true;
    if (!profile.exists || data?.active !== true || !(activeMember || legacyBod || globalManager)) throw new CustomFieldAuthError("Mentioned user is not available in this workspace.", 403);
    return { uid, name: typeof data?.name === "string" && data.name.trim() ? data.name.trim() : "Employee" };
  }));
  return docs;
}

function assertMentionsAppearInBody(body: string, mentions: { uid: string; name: string }[]) {
  if (mentions.some((mention) => !body.includes(`@${mention.name}`))) {
    throw new CustomFieldAuthError("Mentioned users must appear in the comment.", 403);
  }
}

export async function createComment(request: Request, workspaceId: string, entityType: CommentEntityType, entityId: string, input: CommentInput) {
  const actor = await requireCustomFieldWorkspaceUser(request, workspaceId);
  if (typeof input.body !== "string") throw new CustomFieldAuthError("Invalid comment.", 403);
  const body = input.body.trim();
  if (!body || body.length > MAX_COMMENT_LENGTH) throw new CustomFieldAuthError("Comment must be between 1 and 4,000 characters.", 403);
  const mentionedUserIds = asMentionIds(input.mentionedUserIds);
  const parentCommentId = typeof input.parentCommentId === "string" && input.parentCommentId.trim() ? input.parentCommentId.trim() : undefined;
  if (input.parentCommentId !== undefined && !parentCommentId) throw new CustomFieldAuthError("Invalid parent comment.", 403);
  await requireEntity(workspaceId, entityType, entityId);
  let parentAuthorUid: string | undefined;
  if (parentCommentId) {
    const parent = await adminDb.collection("comments").doc(parentCommentId).get();
    if (!parent.exists || parent.data()?.workspaceId !== workspaceId || parent.data()?.entityType !== entityType || parent.data()?.entityId !== entityId || parent.data()?.parentCommentId || parent.data()?.deletedAt) throw new CustomFieldAuthError("Parent comment not found.", 404);
    parentAuthorUid = typeof parent.data()?.authorUid === "string" ? parent.data()?.authorUid : undefined;
  }
  const [author, mentions] = await Promise.all([adminDb.collection("users").doc(actor.uid).get(), mentionSnapshots(workspaceId, mentionedUserIds)]);
  assertMentionsAppearInBody(body, mentions);
  const comment = adminDb.collection("comments").doc();
  const batch = adminDb.batch();
  batch.set(comment, { workspaceId, entityType, entityId, body, authorUid: actor.uid, authorName: author.data()?.name || "Employee", parentCommentId: parentCommentId || null, mentionedUserIds: mentions.map((item) => item.uid), mentionSnapshots: mentions, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
  for (const mentioned of mentions.filter((item) => item.uid !== actor.uid && item.uid !== parentAuthorUid)) {
    const notification = adminDb.collection("notifications").doc(`mention_${comment.id}_${mentioned.uid}`);
    batch.set(notification, { workspaceId, recipientUid: mentioned.uid, actorUid: actor.uid, eventType: "mention", entityType, entityId, commentId: comment.id, title: "You were mentioned", message: `${author.data()?.name || "A teammate"} mentioned you in a comment.`, readAt: null, archivedAt: null, createdAt: FieldValue.serverTimestamp() });
  }
  if (parentAuthorUid && parentAuthorUid !== actor.uid) {
    batch.set(adminDb.collection("notifications").doc(`reply_${comment.id}_${parentAuthorUid}`), { workspaceId, recipientUid: parentAuthorUid, actorUid: actor.uid, eventType: "reply", entityType, entityId, commentId: comment.id, title: "New reply", message: `${author.data()?.name || "A teammate"} replied to your comment.`, readAt: null, archivedAt: null, createdAt: FieldValue.serverTimestamp() });
  }
  await batch.commit();
  return { id: comment.id };
}

export async function updateComment(request: Request, workspaceId: string, commentId: string, bodyInput: unknown, mentionedInput: unknown) {
  const actor = await requireCustomFieldWorkspaceUser(request, workspaceId);
  if (typeof bodyInput !== "string") throw new CustomFieldAuthError("Invalid comment.", 403);
  const body = bodyInput.trim();
  if (!body || body.length > MAX_COMMENT_LENGTH) throw new CustomFieldAuthError("Comment must be between 1 and 4,000 characters.", 403);
  const comment = await adminDb.collection("comments").doc(commentId).get();
  if (!comment.exists || comment.data()?.workspaceId !== workspaceId) throw new CustomFieldAuthError("Comment not found.", 404);
  if (comment.data()?.deletedAt) throw new CustomFieldAuthError("Comment not found.", 404);
  if (comment.data()?.authorUid !== actor.uid) throw new CustomFieldAuthError("You can only change your own comments.", 403);
  const mentionedUserIds = asMentionIds(mentionedInput);
  const mentions = await mentionSnapshots(workspaceId, mentionedUserIds);
  assertMentionsAppearInBody(body, mentions);
  const storedMentionIds: unknown = comment.data()?.mentionedUserIds;
  const existingIds = new Set(Array.isArray(storedMentionIds) ? storedMentionIds.filter((item: unknown): item is string => typeof item === "string") : []);
  const author = await adminDb.collection("users").doc(actor.uid).get();
  const batch = adminDb.batch();
  batch.update(comment.ref, { body, mentionedUserIds: mentions.map((item) => item.uid), mentionSnapshots: mentions, updatedAt: FieldValue.serverTimestamp(), editedAt: FieldValue.serverTimestamp() });
  for (const mentioned of mentions.filter((item) => item.uid !== actor.uid && !existingIds.has(item.uid))) {
    batch.set(adminDb.collection("notifications").doc(`mention_${comment.id}_${mentioned.uid}`), { workspaceId, recipientUid: mentioned.uid, actorUid: actor.uid, eventType: "mention", entityType: comment.data()?.entityType, entityId: comment.data()?.entityId, commentId, title: "You were mentioned", message: `${author.data()?.name || "A teammate"} mentioned you in a comment.`, readAt: null, archivedAt: null, createdAt: FieldValue.serverTimestamp() });
  }
  await batch.commit();
}

export async function deleteComment(request: Request, workspaceId: string, commentId: string) {
  const actor = await requireCustomFieldWorkspaceUser(request, workspaceId);
  const comment = await adminDb.collection("comments").doc(commentId).get();
  if (!comment.exists || comment.data()?.workspaceId !== workspaceId) throw new CustomFieldAuthError("Comment not found.", 404);
  if (comment.data()?.deletedAt) throw new CustomFieldAuthError("Comment not found.", 404);
  if (comment.data()?.authorUid !== actor.uid) throw new CustomFieldAuthError("You can only change your own comments.", 403);
  const replies = await adminDb.collection("comments").where("workspaceId", "==", workspaceId).where("parentCommentId", "==", commentId).limit(1).get();
  if (replies.empty) {
    await comment.ref.delete();
    return;
  }
  await comment.ref.update({
    body: "",
    mentionedUserIds: [],
    mentionSnapshots: [],
    deletedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
}

export function parseCommentTarget(value: unknown): { entityType: CommentEntityType; entityId: string } {
  if (!value || typeof value !== "object") throw new CustomFieldAuthError("Invalid comment target.", 403);
  const target = value as { entityType?: unknown; entityId?: unknown };
  if (!validEntityType(target.entityType) || typeof target.entityId !== "string" || !target.entityId.trim()) throw new CustomFieldAuthError("Invalid comment target.", 403);
  return { entityType: target.entityType, entityId: target.entityId.trim() };
}
