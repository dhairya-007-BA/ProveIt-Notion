import "server-only";

import { createHash } from "node:crypto";

import { FieldValue, Timestamp } from "firebase-admin/firestore";

import { requireCustomFieldWorkspaceUser } from "@/lib/custom-field-route-auth";
import { adminDb } from "@/lib/firebase-admin";
import { enqueueMeetingNotification } from "@/lib/meeting-notification-outbox";
import { meetingStatuses, type MeetingStatus } from "@/lib/meetings";

export class MeetingUpdateError extends Error {
  constructor(message: string, public status: 404 | 422, public code: string) {
    super(message);
    this.name = "MeetingUpdateError";
  }
}

type MeetingUpdate = {
  title: string;
  notes: string;
  transcript: string;
  status: MeetingStatus;
  location: string;
  meetingUrl: string;
  participantIds: string[];
  startAt: Date | null;
  endAt: Date | null;
};

export type MeetingInvitationTarget = { recipientUid: string; occurrence: number };

function invitationOccurrenceId(meetingId: string, recipientUid: string) {
  return createHash("sha256").update(`${meetingId}\u0000${recipientUid}`).digest("hex").slice(0, 40);
}

export function meetingInvitationEventId(meetingId: string, recipientUid: string, occurrence: number) {
  const fingerprint = createHash("sha256").update(`${meetingId}\u0000${recipientUid}`).digest("hex").slice(0, 32);
  return `meeting_invitation_${fingerprint}_${occurrence}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function limited(value: unknown, label: string, max: number, required = false) {
  if (typeof value !== "string") throw new MeetingUpdateError(`${label} is invalid.`, 422, "invalid_meeting");
  const normalized = value.trim();
  if ((required && !normalized) || normalized.length > max) throw new MeetingUpdateError(`${label} is invalid.`, 422, "invalid_meeting");
  return normalized;
}

function date(value: unknown, label: string) {
  if (value === null) return null;
  if (typeof value !== "string") throw new MeetingUpdateError(`${label} is invalid.`, 422, "invalid_meeting_date");
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new MeetingUpdateError(`${label} is invalid.`, 422, "invalid_meeting_date");
  return parsed;
}

export function parseMeetingUpdate(value: unknown): MeetingUpdate {
  if (!isRecord(value)) throw new MeetingUpdateError("Meeting changes are invalid.", 422, "invalid_meeting");
  const title = limited(value.title, "Meeting title", 200, true);
  const notes = limited(value.notes, "Meeting notes", 100_000);
  const transcript = limited(value.transcript, "Meeting transcript", 200_000);
  const status = value.status as MeetingStatus;
  const location = limited(value.location, "Meeting location", 500);
  const meetingUrl = limited(value.meetingUrl, "Meeting URL", 2_000);
  if (!meetingStatuses.includes(status)) throw new MeetingUpdateError("Meeting status is invalid.", 422, "invalid_meeting_status");
  if (meetingUrl) { try { new URL(meetingUrl); } catch { throw new MeetingUpdateError("Meeting URL is invalid.", 422, "invalid_meeting_url"); } }
  if (!Array.isArray(value.participantIds) || value.participantIds.length > 200 || value.participantIds.some((id) => typeof id !== "string" || !id.trim() || id.length > 128)) {
    throw new MeetingUpdateError("Meeting participants are invalid.", 422, "invalid_participants");
  }
  const participantIds = [...new Set(value.participantIds as string[])];
  if (participantIds.length !== value.participantIds.length) throw new MeetingUpdateError("Meeting participants cannot contain duplicates.", 422, "invalid_participants");
  const startAt = date(value.startAt, "Meeting start time");
  const endAt = date(value.endAt, "Meeting end time");
  if (startAt && endAt && endAt <= startAt) throw new MeetingUpdateError("Meeting end time must be after its start time.", 422, "invalid_meeting_date");
  return { title, notes, transcript, status, location, meetingUrl, participantIds, startAt, endAt };
}

export async function updateMeeting(request: Request, workspaceId: string, meetingId: string, value: unknown) {
  const actor = await requireCustomFieldWorkspaceUser(request, workspaceId);
  const update = parseMeetingUpdate(value);
  const result = await adminDb.runTransaction(async (transaction) => {
    const meetingRef = adminDb.collection("meetings").doc(meetingId);
    const meeting = await transaction.get(meetingRef);
    const current = meeting.data();
    if (!meeting.exists || current?.workspaceId !== workspaceId) throw new MeetingUpdateError("Meeting not found.", 404, "meeting_not_found");
    const eligibility = await Promise.all(update.participantIds.map(async (uid) => {
      const [profile, membership] = await Promise.all([
        transaction.get(adminDb.collection("users").doc(uid)),
        transaction.get(adminDb.collection("workspaceMemberships").doc(`${workspaceId}_${uid}`)),
      ]);
      const user = profile.data();
      const bod = user?.role === "bod" || user?.group === "bod";
      return profile.exists && user?.active === true && (
        workspaceId === "company" ||
        (workspaceId === "board" ? bod : bod || (membership.exists && membership.data()?.active === true))
      );
    }));
    if (eligibility.some((eligible) => !eligible)) throw new MeetingUpdateError("Choose active participants with access to this workspace.", 422, "invalid_participants");
    const previous = Array.isArray(current.participantIds) ? current.participantIds.filter((id): id is string => typeof id === "string") : [];
    const addedParticipantIds = update.participantIds.filter((id) => !previous.includes(id));
    const occurrenceRefs = addedParticipantIds.map((uid) => adminDb.collection("meetingInvitationOccurrences").doc(invitationOccurrenceId(meetingId, uid)));
    const occurrenceSnapshots = await Promise.all(occurrenceRefs.map((ref) => transaction.get(ref)));
    const invitations = addedParticipantIds.map((recipientUid, index) => ({
      recipientUid,
      occurrence: typeof occurrenceSnapshots[index].data()?.occurrence === "number" ? occurrenceSnapshots[index].data()!.occurrence + 1 : 1,
    }));
    transaction.update(meetingRef, {
      title: update.title,
      notes: update.notes,
      transcript: update.transcript,
      status: update.status,
      location: update.location,
      meetingUrl: update.meetingUrl,
      participantIds: update.participantIds,
      organizerId: typeof current.organizerId === "string" && current.organizerId ? current.organizerId : actor.uid,
      startAt: update.startAt ? Timestamp.fromDate(update.startAt) : null,
      endAt: update.endAt ? Timestamp.fromDate(update.endAt) : null,
      updatedAt: FieldValue.serverTimestamp(),
    });
    invitations.forEach((invitation, index) => transaction.set(occurrenceRefs[index], {
      workspaceId,
      meetingId,
      recipientUid: invitation.recipientUid,
      occurrence: invitation.occurrence,
      updatedAt: FieldValue.serverTimestamp(),
    }));
    invitations.filter((invitation) => invitation.recipientUid !== actor.uid).forEach((invitation) => enqueueMeetingNotification(transaction, meetingId, {
      eventId: meetingInvitationEventId(meetingId, invitation.recipientUid, invitation.occurrence),
      workspaceId,
      recipientUid: invitation.recipientUid,
      actorUid: actor.uid,
      eventType: "meeting_invitation",
      entityType: "meeting",
      entityId: meetingId,
      title: "Meeting invitation",
      message: `You were invited to “${update.title}”.`,
    }));
    return { actorUid: actor.uid, title: update.title, invitations };
  });
  return result;
}

export async function createMeeting(request: Request, workspaceId: string, value: unknown) {
  const actor = await requireCustomFieldWorkspaceUser(request, workspaceId);
  const create = parseMeetingUpdate(value);
  const creationRequestId = isRecord(value) && typeof value.creationRequestId === "string" ? value.creationRequestId.trim() : "";
  if (!/^[A-Za-z0-9_-]{16,100}$/.test(creationRequestId)) throw new MeetingUpdateError("Meeting creation request is invalid.", 422, "invalid_creation_request");
  const eligibility = await Promise.all(create.participantIds.map(async (uid) => {
    const [profile, membership] = await Promise.all([
      adminDb.collection("users").doc(uid).get(),
      adminDb.collection("workspaceMemberships").doc(`${workspaceId}_${uid}`).get(),
    ]);
    const user = profile.data();
    const bod = user?.role === "bod" || user?.group === "bod";
    return profile.exists && user?.active === true && (
      workspaceId === "company" ||
      (workspaceId === "board" ? bod : bod || (membership.exists && membership.data()?.active === true))
    );
  }));
  if (eligibility.some((eligible) => !eligible)) throw new MeetingUpdateError("Choose active participants with access to this workspace.", 422, "invalid_participants");
  const meetingId = `meeting-${createHash("sha256").update(`${workspaceId}\u0000${actor.uid}\u0000${creationRequestId}`).digest("hex").slice(0, 32)}`;
  const ref = adminDb.collection("meetings").doc(meetingId);
  const invitations = create.participantIds.map((recipientUid) => ({ recipientUid, occurrence: 1 }));
  const created = await adminDb.runTransaction(async (transaction) => {
    const existing = await transaction.get(ref);
    if (existing.exists) {
      const data = existing.data();
      if (data?.workspaceId !== workspaceId || data?.createdBy !== actor.uid || data?.creationRequestId !== creationRequestId) {
        throw new MeetingUpdateError("A conflicting meeting creation request exists.", 422, "creation_request_conflict");
      }
      return false;
    }
    transaction.create(ref, {
      ...create,
      startAt: create.startAt ? Timestamp.fromDate(create.startAt) : null,
      endAt: create.endAt ? Timestamp.fromDate(create.endAt) : null,
      workspaceId,
      createdBy: actor.uid,
      organizerId: actor.uid,
      creationRequestId,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    invitations.forEach((invitation) => transaction.create(
      adminDb.collection("meetingInvitationOccurrences").doc(invitationOccurrenceId(ref.id, invitation.recipientUid)),
      { workspaceId, meetingId: ref.id, recipientUid: invitation.recipientUid, occurrence: 1, updatedAt: FieldValue.serverTimestamp() },
    ));
    invitations.filter((invitation) => invitation.recipientUid !== actor.uid).forEach((invitation) => enqueueMeetingNotification(transaction, ref.id, {
      eventId: meetingInvitationEventId(ref.id, invitation.recipientUid, invitation.occurrence),
      workspaceId,
      recipientUid: invitation.recipientUid,
      actorUid: actor.uid,
      eventType: "meeting_invitation",
      entityType: "meeting",
      entityId: ref.id,
      title: "Meeting invitation",
      message: `You were invited to “${create.title}”.`,
    }));
    return true;
  });
  return { meetingId: ref.id, actorUid: actor.uid, title: create.title, invitations: created ? invitations : [], created };
}
