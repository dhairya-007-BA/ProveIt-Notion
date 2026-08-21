import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const snapshots = new Map<string, { exists: boolean; data: () => Record<string, unknown> }>();
  const updates: Array<{ path: string; data: Record<string, unknown> }> = [];
  const creates: Array<{ path: string; data: Record<string, unknown> }> = [];
  const sets: Array<{ path: string; data: Record<string, unknown> }> = [];
  const ref = (collection: string, id = "generated-meeting") => ({
    path: `${collection}/${id}`,
    id,
    get: async () => snapshots.get(`${collection}/${id}`) ?? { exists: false, data: () => ({}) },
    create: async (data: Record<string, unknown>) => { creates.push({ path: `${collection}/${id}`, data }); },
  });
  const transaction = {
    get: vi.fn(async (target: { path: string }) => snapshots.get(target.path) ?? { exists: false, data: () => ({}) }),
    update: vi.fn((target: { path: string }, data: Record<string, unknown>) => updates.push({ path: target.path, data })),
    set: vi.fn((target: { path: string }, data: Record<string, unknown>) => sets.push({ path: target.path, data })),
    create: vi.fn((target: { path: string }, data: Record<string, unknown>) => creates.push({ path: target.path, data })),
  };
  return { snapshots, updates, creates, sets, transaction, ref };
});

const requireWorkspaceUser = vi.hoisted(() => vi.fn());

vi.mock("firebase-admin/firestore", () => ({
  FieldValue: { serverTimestamp: () => "server-time" },
  Timestamp: { fromDate: (date: Date) => ({ date }) },
}));
vi.mock("@/lib/custom-field-route-auth", () => ({ requireCustomFieldWorkspaceUser: requireWorkspaceUser }));
vi.mock("@/lib/firebase-admin", () => ({
  adminDb: {
    collection: (name: string) => ({ doc: (id: string) => mocks.ref(name, id) }),
    runTransaction: (callback: (transaction: typeof mocks.transaction) => unknown) => callback(mocks.transaction),
  },
}));

import { createMeeting, meetingInvitationEventId, parseMeetingUpdate, updateMeeting } from "@/lib/meeting-update";

function snapshot(path: string, data: Record<string, unknown>) {
  mocks.snapshots.set(path, { exists: true, data: () => data });
}

const valid = {
  creationRequestId: "meeting-create-request-1",
  title: "Planning review",
  notes: "Human notes",
  transcript: "Human transcript",
  status: "scheduled",
  location: "Online",
  meetingUrl: "https://example.com/meeting",
  participantIds: ["existing", "new-person"],
  startAt: "2026-09-01T17:00:00.000Z",
  endAt: "2026-09-01T18:00:00.000Z",
};

describe("authorized meeting updates", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.snapshots.clear();
    mocks.updates.length = 0;
    mocks.creates.length = 0;
    mocks.sets.length = 0;
    requireWorkspaceUser.mockResolvedValue({ uid: "organizer" });
    snapshot("meetings/meeting-1", { workspaceId: "technology", organizerId: "organizer", participantIds: ["existing"] });
    for (const uid of ["existing", "new-person"]) {
      snapshot(`users/${uid}`, { active: true });
      snapshot(`workspaceMemberships/technology_${uid}`, { active: true });
    }
  });

  it("rejects malformed URLs, duplicate participants, and reversed dates", () => {
    expect(() => parseMeetingUpdate({ ...valid, meetingUrl: "not-a-url" })).toThrow("URL is invalid");
    expect(() => parseMeetingUpdate({ ...valid, participantIds: ["existing", "existing"] })).toThrow("cannot contain duplicates");
    expect(() => parseMeetingUpdate({ ...valid, endAt: "2026-09-01T16:00:00.000Z" })).toThrow("after its start");
  });

  it("rejects a participant without current workspace access", async () => {
    mocks.snapshots.delete("workspaceMemberships/technology_new-person");
    await expect(updateMeeting(new Request("http://local"), "technology", "meeting-1", valid)).rejects.toThrow("access to this workspace");
    expect(mocks.transaction.update).not.toHaveBeenCalled();
  });

  it("updates all meeting fields together and returns only new invitation recipients", async () => {
    const result = await updateMeeting(new Request("http://local"), "technology", "meeting-1", valid);
    expect(result).toEqual({ actorUid: "organizer", title: "Planning review", invitations: [{ recipientUid: "new-person", occurrence: 1 }] });
    expect(mocks.updates).toEqual([expect.objectContaining({
      path: "meetings/meeting-1",
      data: expect.objectContaining({ participantIds: ["existing", "new-person"], notes: "Human notes", transcript: "Human transcript", organizerId: "organizer" }),
    })]);
    expect(mocks.creates).toContainEqual(expect.objectContaining({
      path: expect.stringMatching(/^meetingNotificationOutbox\/meeting_invitation_/),
      data: expect.objectContaining({ meetingId: "meeting-1", status: "pending" }),
    }));
  });

  it("increments a server-owned invitation occurrence when a participant is re-added", async () => {
    const occurrencePath = [...mocks.snapshots.keys()].find((path) => path.startsWith("meetingInvitationOccurrences/"));
    expect(occurrencePath).toBeUndefined();
    // The occurrence document id is opaque, so discover the ref requested by
    // the first run and seed it as if this participant had been invited before.
    await updateMeeting(new Request("http://local"), "technology", "meeting-1", valid);
    const occurrenceWrite = mocks.sets.find((write) => write.path.startsWith("meetingInvitationOccurrences/"));
    expect(occurrenceWrite).toBeDefined();
    snapshot(occurrenceWrite!.path, { ...occurrenceWrite!.data, occurrence: 1 });
    mocks.sets.length = 0;
    const readded = await updateMeeting(new Request("http://local"), "technology", "meeting-1", valid);
    expect(readded.invitations).toEqual([{ recipientUid: "new-person", occurrence: 2 }]);
    expect(meetingInvitationEventId("meeting-1", "new-person", 2)).not.toBe(meetingInvitationEventId("meeting-1", "new-person", 1));
  });

  it("creates a server-authored meeting and returns all initial invitation recipients", async () => {
    const result = await createMeeting(new Request("http://local"), "technology", valid);
    expect(result).toEqual(expect.objectContaining({ actorUid: "organizer", title: "Planning review", created: true, invitations: [{ recipientUid: "existing", occurrence: 1 }, { recipientUid: "new-person", occurrence: 1 }] }));
    expect(mocks.creates).toContainEqual(expect.objectContaining({
      path: expect.stringMatching(/^meetings\/meeting-/),
      data: expect.objectContaining({ workspaceId: "technology", createdBy: "organizer", organizerId: "organizer", creationRequestId: "meeting-create-request-1", participantIds: ["existing", "new-person"] }),
    }));
    const meetingWrite = mocks.creates.find((write) => write.path.startsWith("meetings/"));
    snapshot(meetingWrite!.path, meetingWrite!.data);
    mocks.creates.length = 0;
    mocks.transaction.create.mockClear();
    const retry = await createMeeting(new Request("http://local"), "technology", valid);
    expect(retry).toEqual(expect.objectContaining({ meetingId: result.meetingId, created: false, invitations: [] }));
    expect(mocks.transaction.create).not.toHaveBeenCalled();
  });
});
