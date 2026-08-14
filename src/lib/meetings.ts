import { ProveItUser } from "@/types/user";

export const meetingStatuses = ["scheduled", "in_progress", "completed", "cancelled"] as const;

export type MeetingStatus = (typeof meetingStatuses)[number];

export interface MeetingRecord {
  id: string;
  title: string;
  workspaceId: string;
  notes: string;
  transcript: string;
  status: MeetingStatus;
  startAt?: Date;
  endAt?: Date;
  location: string;
  meetingUrl: string;
  participantIds: string[];
  organizerId: string;
  createdBy: string;
  createdAt?: Date;
  updatedAt?: Date;
}

function asDate(value: unknown) {
  return value && typeof value === "object" && "toDate" in value
    ? (value as { toDate: () => Date }).toDate()
    : value instanceof Date ? value : undefined;
}

function asStrings(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

export function meetingFromFirestore(id: string, value: Record<string, unknown>): MeetingRecord {
  const participantIds = asStrings(value.participantIds);
  const legacyAttendees = asStrings(value.attendees);

  return {
    id,
    title: typeof value.title === "string" && value.title.trim() ? value.title : "Untitled meeting",
    workspaceId: typeof value.workspaceId === "string" ? value.workspaceId : "",
    notes: typeof value.notes === "string" ? value.notes : "",
    transcript: typeof value.transcript === "string" ? value.transcript : "",
    status: meetingStatuses.includes(value.status as MeetingStatus) ? value.status as MeetingStatus : "scheduled",
    startAt: asDate(value.startAt) || asDate(value.scheduledAt) || asDate(value.meetingDate),
    endAt: asDate(value.endAt),
    location: typeof value.location === "string" ? value.location : "",
    meetingUrl: typeof value.meetingUrl === "string" ? value.meetingUrl : "",
    participantIds: participantIds.length ? participantIds : legacyAttendees,
    organizerId: typeof value.organizerId === "string" ? value.organizerId : typeof value.createdBy === "string" ? value.createdBy : "",
    createdBy: typeof value.createdBy === "string" ? value.createdBy : "",
    createdAt: asDate(value.createdAt),
    updatedAt: asDate(value.updatedAt),
  };
}

export function eligibleWorkspaceUsers(users: ProveItUser[], workspaceId: string, memberIds: Set<string>) {
  return users.filter((user) => user.active && (
    workspaceId === "company" || user.group === "bod" || memberIds.has(user.uid)
  )).sort((left, right) => left.name.localeCompare(right.name));
}

export function meetingParticipantNames(meeting: MeetingRecord, users: ProveItUser[]) {
  const usersById = new Map(users.map((user) => [user.uid, user.name]));
  return meeting.participantIds.map((value) => usersById.get(value) || (value.includes(" ") ? value : "Former participant"));
}

export function meetingStatusLabel(status: MeetingStatus) {
  return status === "in_progress" ? "In progress" : status[0].toUpperCase() + status.slice(1);
}
