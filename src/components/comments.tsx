"use client";

import { useEffect, useState } from "react";
import { collection, doc, getDoc, onSnapshot, query, serverTimestamp, where, writeBatch } from "firebase/firestore";

import { useAuth } from "@/components/auth-provider";
import { db } from "@/lib/firebase";
import { getUsers } from "@/lib/users";
import { ProveItUser } from "@/types/user";

type EntityType = "meeting" | "task" | "document" | "database-row";
type Comment = { id: string; body: string; authorUid: string; authorName: string; createdAt?: Date; parentCommentId?: string | null };

export function Comments({ workspaceId, entityType, entityId }: { workspaceId: string; entityType: EntityType; entityId: string }) {
  const { firebaseUser, profile } = useAuth();
  const [comments, setComments] = useState<Comment[]>([]);
  const [users, setUsers] = useState<ProveItUser[]>([]);
  const [body, setBody] = useState("");
  const [mention, setMention] = useState("");
  const [replyingTo, setReplyingTo] = useState<Comment | null>(null);
  const [error, setError] = useState("");
  const [posting, setPosting] = useState(false);

  useEffect(() => {
    if (!firebaseUser) return;
    void getUsers().then(setUsers).catch(() => setError("People could not be loaded."));
    return onSnapshot(query(collection(db, "comments"), where("workspaceId", "==", workspaceId), where("entityId", "==", entityId)), (snapshot) => setComments(snapshot.docs.map((item) => ({ id: item.id, body: item.data().body || "", authorUid: item.data().authorUid || "", authorName: item.data().authorName || "Unknown employee", parentCommentId: item.data().parentCommentId || null, createdAt: item.data().createdAt?.toDate() })).sort((left, right) => (left.createdAt?.getTime() || 0) - (right.createdAt?.getTime() || 0))), (listenerError) => { console.error("Failed to load comments:", listenerError); setError("Comments could not be loaded."); });
  }, [entityId, firebaseUser, workspaceId]);

  async function postComment() {
    if (!firebaseUser || !profile || !body.trim() || posting) return;
    const mentioned = users.find((user) => user.uid === mention);
    try {
      setPosting(true);
      setError("");
      const batch = writeBatch(db);
      const commentRef = doc(collection(db, "comments"));
      batch.set(commentRef, { workspaceId, entityType, entityId, body: body.trim(), authorUid: firebaseUser.uid, authorName: profile.name, mentionedUid: mentioned?.uid || null, parentCommentId: replyingTo?.id || null, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
      const recipients = new Set<string>();
      if (mentioned && mentioned.uid !== firebaseUser.uid && (await getDoc(doc(db, "users", mentioned.uid))).data()?.notificationPreferences?.mentions !== false) recipients.add(mentioned.uid);
      if (replyingTo && replyingTo.authorUid !== firebaseUser.uid) recipients.add(replyingTo.authorUid);
      recipients.forEach((recipientUid) => batch.set(doc(collection(db, "notifications")), { recipientUid, workspaceId, type: mentioned?.uid === recipientUid ? "mention" : "comment_reply", title: mentioned?.uid === recipientUid ? "You were mentioned" : "New reply", message: `${profile.name} ${mentioned?.uid === recipientUid ? "mentioned you" : "replied to your comment"}.`, entityType, entityId, commentId: commentRef.id, actorUid: firebaseUser.uid, createdAt: serverTimestamp(), readAt: null, archivedAt: null }));
      await batch.commit();
      setBody("");
      setMention("");
      setReplyingTo(null);
    } catch (postError) {
      console.error("Failed to post comment:", postError);
      setError("Comment could not be posted.");
    } finally {
      setPosting(false);
    }
  }

  const roots = comments.filter((comment) => !comment.parentCommentId);
  return <section className="mt-9 border-t border-[var(--border)] pt-6"><div className="flex items-baseline justify-between"><h2 className="proveit-section-title">Comments</h2><span className="text-xs text-[var(--subtle)]">{comments.length || "No"} {comments.length === 1 ? "comment" : "comments"}</span></div><div className="mt-5 space-y-5">{roots.map((comment) => <Thread key={comment.id} comment={comment} replies={comments.filter((reply) => reply.parentCommentId === comment.id)} onReply={setReplyingTo} />)}{!error && roots.length === 0 && <p className="py-3 text-sm text-[var(--muted)]">Start the conversation for this record.</p>}</div><div className="mt-6 rounded-xl border border-[var(--border)] bg-white p-3 shadow-[var(--shadow-sm)]">{replyingTo && <p className="mb-2 text-xs text-[var(--muted)]">Replying to <strong className="font-medium text-[var(--foreground)]">{replyingTo.authorName}</strong> <button onClick={() => setReplyingTo(null)} className="ml-1 underline hover:text-[var(--foreground)]">Cancel</button></p>}<textarea aria-label="Comment" value={body} onChange={(event) => setBody(event.target.value)} placeholder={replyingTo ? "Write a reply…" : "Add a comment…"} className="min-h-24 w-full resize-y rounded-lg border border-transparent bg-[var(--sidebar)] px-3 py-2.5 text-sm leading-6 outline-none transition placeholder:text-[var(--subtle)] focus:border-[var(--focus)] focus:bg-white" /><div className="mt-3 flex items-center justify-between gap-3"><select aria-label="Mention teammate" value={mention} onChange={(event) => setMention(event.target.value)} className="rounded-lg border border-transparent bg-[var(--sidebar)] px-2.5 py-2 text-sm hover:border-[var(--border)]"><option value="">Mention someone…</option>{users.filter((user) => user.active && user.uid !== firebaseUser?.uid).map((user) => <option key={user.uid} value={user.uid}>@{user.name}</option>)}</select><button data-testid="comment-submit" onClick={postComment} disabled={!body.trim() || posting} className="proveit-primary-button disabled:cursor-not-allowed disabled:opacity-50">{posting ? "Posting…" : replyingTo ? "Reply" : "Comment"}</button></div>{error && <p role="alert" className="mt-2 text-sm text-[var(--danger)]">{error}</p>}</div></section>;
}

function Thread({ comment, replies, onReply }: { comment: Comment; replies: Comment[]; onReply: (comment: Comment) => void }) {
  const [showReplies, setShowReplies] = useState(true);
  return <article><CommentItem comment={comment} onReply={onReply} />{replies.length > 0 && <div className="ml-4 mt-3 border-l border-[var(--border)] pl-4"><button onClick={() => setShowReplies(!showReplies)} className="mb-2 text-xs text-[var(--muted)] transition hover:text-[var(--foreground)]">{showReplies ? "Hide" : "Show"} {replies.length} {replies.length === 1 ? "reply" : "replies"}</button>{showReplies && <div className="space-y-3">{replies.map((reply) => <CommentItem key={reply.id} comment={reply} onReply={onReply} />)}</div>}</div>}</article>;
}

function CommentItem({ comment, onReply }: { comment: Comment; onReply: (comment: Comment) => void }) {
  return <div className="group flex gap-3 rounded-lg px-2 py-1.5 transition hover:bg-[var(--hover)]"><span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[var(--active)] text-[11px] font-medium text-[var(--muted)]">{comment.authorName.slice(0, 1).toUpperCase()}</span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-baseline gap-x-2"><p className="text-sm font-medium">{comment.authorName}</p><time className="text-xs text-[var(--subtle)]">{comment.createdAt?.toLocaleString() || "Just now"}</time></div><p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-[var(--foreground)]">{comment.body}</p><button onClick={() => onReply(comment)} className="mt-1.5 text-xs text-[var(--muted)] opacity-0 transition hover:text-[var(--foreground)] focus:opacity-100 group-hover:opacity-100">Reply</button></div></div>;
}
