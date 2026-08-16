import { describe, expect, it } from "vitest";

import { meetingFromFirestore, meetingParticipantNames, validateMeetingDraft } from "@/lib/meetings";

describe("meeting normalization", () => {
  it("retains legacy meeting fields without exposing raw participant IDs", () => {
    const meeting = meetingFromFirestore("legacy", {
      title: "Legacy review", workspaceId: "company", scheduledAt: { toDate: () => new Date("2026-08-14T10:00:00") },
      attendees: ["Legacy attendee", "missing-user"], notes: "Existing notes", createdBy: "owner",
    });
    expect(meeting.startAt?.toISOString()).toContain("2026-08-14");
    expect(meeting.status).toBe("scheduled");
    expect(meetingParticipantNames(meeting, [])).toEqual(["Legacy attendee", "Former participant"]);
  });

  it("prefers the new participant and time fields when present", () => {
    const meeting = meetingFromFirestore("new", { title: "Planning", workspaceId: "business", participantIds: ["member"], startAt: { toDate: () => new Date("2026-08-15T09:00:00") }, status: "in_progress" });
    expect(meeting.participantIds).toEqual(["member"]);
    expect(meeting.status).toBe("in_progress");
    expect(meetingParticipantNames(meeting, [{ uid: "member", name: "Member Name", employeeId: "1", group: "business_intern", active: true }])).toEqual(["Member Name"]);
  });

  it("validates titles, date-time order, URLs, and workspace attendees before persistence", () => {
    const base = { title: "Planning", date: "2026-08-20", startTime: "09:00", endTime: "10:00", meetingUrl: "", participantIds: ["member"], allowedParticipantIds: new Set(["member"]) };
    expect(validateMeetingDraft(base)).toBeNull();
    expect(validateMeetingDraft({ ...base, title: " " })).toBe("A meeting title is required.");
    expect(validateMeetingDraft({ ...base, endTime: "08:00" })).toBe("End time must be after the start time.");
    expect(validateMeetingDraft({ ...base, date: "", startTime: "09:00" })).toBe("Choose a meeting date before setting a time.");
    expect(validateMeetingDraft({ ...base, meetingUrl: "not a url" })).toBe("Enter a valid meeting link.");
    expect(validateMeetingDraft({ ...base, participantIds: ["other"] })).toBe("Choose valid workspace attendees.");
  });
});
