import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const snapshots = new Map<string, { exists: boolean; data: () => Record<string, unknown>; ref?: unknown }>();
  const batchSet = vi.fn();
  const batchUpdate = vi.fn();
  const batchDelete = vi.fn();
  const commit = vi.fn();
  const directUpdate = vi.fn();
  const directDelete = vi.fn();
  const replyDocs: unknown[] = [];
  const doc = (collectionName: string, id = "new-comment") => {
    const ref = { id, update: directUpdate, delete: directDelete };
    return { ...ref, get: vi.fn(async () => snapshots.get(`${collectionName}/${id}`) ?? { exists: false, data: () => ({}), ref }) };
  };
  const collection = vi.fn((name: string) => ({
    doc: (id?: string) => doc(name, id),
    where: () => ({ where: () => ({ limit: () => ({ get: async () => ({ empty: replyDocs.length === 0, docs: replyDocs }) }) }) }),
  }));
  return { snapshots, batchSet, batchUpdate, batchDelete, commit, directUpdate, directDelete, replyDocs, collection };
});

const requireCustomFieldWorkspaceUser = vi.hoisted(() => vi.fn());
const prepareCanonicalNotification = vi.hoisted(() => vi.fn(async (event: { eventId: string }) => ({ event, notification: { id: event.eventId, data: { canonical: true } }, email: null })));
const deliverPreparedCanonicalNotification = vi.hoisted(() => vi.fn(async () => ({ status: "suppressed" })));
const dispatchCanonicalNotification = vi.hoisted(() => vi.fn(async () => ({ notificationCreated: true, email: { status: "suppressed" } })));

vi.mock("firebase-admin/firestore", () => ({ FieldValue: { serverTimestamp: () => "server-time", arrayUnion: (...values: unknown[]) => ({ arrayUnion: values }) } }));
vi.mock("@/lib/firebase-admin", () => ({
  adminDb: {
    collection: mocks.collection,
    batch: () => ({ set: mocks.batchSet, update: mocks.batchUpdate, delete: mocks.batchDelete, commit: mocks.commit }),
  },
}));
vi.mock("@/lib/custom-field-route-auth", () => ({
  requireCustomFieldWorkspaceUser,
  CustomFieldAuthError: class CustomFieldAuthError extends Error {
    constructor(message: string, public status: number) { super(message); }
  },
}));
vi.mock("@/lib/notification-service", () => ({ prepareCanonicalNotification, deliverPreparedCanonicalNotification, dispatchCanonicalNotification }));

import { createComment, deleteComment, updateComment } from "@/lib/comment-service";

function snapshot(path: string, data: Record<string, unknown>) {
  const ref = { update: mocks.directUpdate, delete: mocks.directDelete };
  mocks.snapshots.set(path, { exists: true, data: () => data, ref });
}

describe("comment service security invariants", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.snapshots.clear();
    mocks.replyDocs.length = 0;
    requireCustomFieldWorkspaceUser.mockResolvedValue({ uid: "actor" });
    snapshot("tasks/task-1", { workspaceId: "company" });
    snapshot("users/actor", { active: true, name: "Actor" });
    snapshot("users/recipient", { active: true, name: "Recipient User" });
    mocks.commit.mockResolvedValue(undefined);
  });

  it("rejects a structured recipient that is not present as a textual mention", async () => {
    await expect(createComment(new Request("http://local"), "company", "task", "task-1", {
      body: "Please review this.",
      mentionedUserIds: ["recipient"],
    })).rejects.toThrow("Mentioned users must appear in the comment.");
    expect(mocks.batchSet).not.toHaveBeenCalled();
  });

  it("deduplicates a parent-author mention into the reply notification", async () => {
    snapshot("comments/parent", { workspaceId: "company", entityType: "task", entityId: "task-1", authorUid: "recipient", parentCommentId: null });

    await createComment(new Request("http://local"), "company", "task", "task-1", {
      body: "@Recipient User here is the reply.",
      parentCommentId: "parent",
      mentionedUserIds: ["recipient", "recipient"],
    });

    const writtenRefs = mocks.batchSet.mock.calls.map(([ref]) => (ref as { id: string }).id);
    expect(writtenRefs).toContain("new-comment");
    expect(writtenRefs).toContain("reply_new-comment_recipient");
    expect(writtenRefs).not.toContain("mention_new-comment_recipient");
  });

  it("soft-deletes a parent while preserving replies from other authors", async () => {
    snapshot("comments/parent", { workspaceId: "company", authorUid: "actor" });
    mocks.replyDocs.push({ ref: { delete: vi.fn() } });

    await deleteComment(new Request("http://local"), "company", "parent");

    expect(mocks.directDelete).not.toHaveBeenCalled();
    expect(mocks.directUpdate).toHaveBeenCalledWith(expect.objectContaining({ body: "", deletedAt: "server-time" }));
  });

  it("never replays a mention notification after the same recipient was previously notified", async () => {
    snapshot("comments/comment-1", {
      workspaceId: "company", entityType: "task", entityId: "task-1", authorUid: "actor",
      mentionedUserIds: [], notifiedMentionUserIds: ["recipient"],
    });
    await updateComment(new Request("http://local"), "company", "comment-1", "@Recipient User please review again.", ["recipient"]);
    expect(prepareCanonicalNotification).not.toHaveBeenCalled();
    expect(dispatchCanonicalNotification).not.toHaveBeenCalled();
    expect(mocks.batchSet).not.toHaveBeenCalled();
    expect(mocks.batchUpdate).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      notifiedMentionUserIds: ["recipient"],
    }));
  });

  it("routes legacy mention replays through create-if-absent dispatch instead of overwriting canonical state", async () => {
    snapshot("comments/comment-legacy", {
      workspaceId: "company", entityType: "task", entityId: "task-1", authorUid: "actor", mentionedUserIds: [],
    });
    dispatchCanonicalNotification.mockResolvedValueOnce({ notificationCreated: false, email: { status: "duplicate" } });
    await updateComment(new Request("http://local"), "company", "comment-legacy", "@Recipient User please review again.", ["recipient"]);
    expect(dispatchCanonicalNotification).toHaveBeenCalledWith(expect.objectContaining({ eventId: "mention_comment-legacy_recipient" }));
    expect(mocks.batchSet).not.toHaveBeenCalled();
    expect(mocks.directUpdate).toHaveBeenCalledWith({ notifiedMentionUserIds: { arrayUnion: ["recipient"] } });
  });
});
