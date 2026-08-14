import { describe, expect, it } from "vitest";

import { meetingFromFirestore, meetingParticipantNames } from "@/lib/meetings";

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
});
