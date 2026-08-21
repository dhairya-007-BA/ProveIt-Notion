import { describe, expect, it, vi } from "vitest";

const persistence = vi.hoisted(() => {
  const transactionSet = vi.fn();
  const transactionUpdate = vi.fn();
  const snapshot = { exists: true, data: vi.fn<() => Record<string, unknown>>() };
  const ref = { id: "meeting-1" };
  return { transactionSet, transactionUpdate, snapshot, ref };
});

vi.mock("server-only", () => ({}));
vi.mock("firebase-admin/firestore", () => ({ FieldValue: { serverTimestamp: () => "server-time" } }));
vi.mock("@/lib/custom-field-route-auth", () => ({
  requireCustomFieldWorkspaceUser: vi.fn(),
  CustomFieldAuthError: class CustomFieldAuthError extends Error {
    constructor(message: string, public status: number, public code?: string) { super(message); }
  },
}));
vi.mock("@/lib/firebase-admin", () => ({
  adminDb: {
    collection: () => ({ doc: () => persistence.ref }),
    runTransaction: async (callback: (transaction: unknown) => Promise<void>) => callback({
      get: async () => persistence.snapshot,
      set: persistence.transactionSet,
      update: persistence.transactionUpdate,
    }),
  },
}));

import { beginMeetingIntelligence, completeAnalysis, completeTranscription, emptyMeetingIntelligence, meetingIntelligenceFromFirestore, transcriptFingerprint } from "@/lib/meeting-intelligence-service";

describe("meeting intelligence persistence mapping", () => {
  it("keeps raw transcripts and AI output separate from meeting human notes", () => {
    const result = meetingIntelligenceFromFirestore("meeting-1", "technology", {
      rawTranscript: "Verbatim raw transcript",
      rawTranscriptSource: "whisper",
      transcription: { status: "completed", attempt: 1 },
      analysis: {
        status: "completed",
        attempt: 1,
        inputSource: "raw_transcript",
        inputFingerprint: "fingerprint",
        output: { summary: "AI summary", decisions: [], risks: [], actionItems: [], followUps: [] },
      },
    });

    expect(result.rawTranscript).toBe("Verbatim raw transcript");
    expect(result.analysis.output?.summary).toBe("AI summary");
    expect(result).not.toHaveProperty("notes");
    expect(result).not.toHaveProperty("transcript");
  });

  it("returns an explicit not-started lifecycle for an untouched meeting", () => {
    const result = emptyMeetingIntelligence("meeting-1", "technology");
    expect(result.transcription).toMatchObject({ status: "not_started", attempt: 0, error: null });
    expect(result.analysis).toMatchObject({ status: "not_started", attempt: 0, output: null });
  });

  it("creates a stable fingerprint for analysis provenance", () => {
    expect(transcriptFingerprint("same input")).toBe(transcriptFingerprint("same input"));
    expect(transcriptFingerprint("same input")).not.toBe(transcriptFingerprint("different input"));
  });

  it("retries a failed analysis as a new observable attempt", async () => {
    persistence.snapshot.data.mockReturnValue({
      workspaceId: "technology",
      analysis: { status: "failed", attempt: 2, failedAt: new Date() },
    });

    await beginMeetingIntelligence("meeting-1", "technology", "analysis");

    expect(persistence.transactionSet).toHaveBeenCalledWith(persistence.ref, expect.objectContaining({
      analysis: expect.objectContaining({ status: "processing", attempt: 3, failedAt: null, error: null }),
    }));
  });

  it("rejects a duplicate request while a live processing lease exists", async () => {
    persistence.snapshot.data.mockReturnValue({
      workspaceId: "technology",
      analysis: { status: "processing", attempt: 1, startedAt: new Date() },
    });

    await expect(beginMeetingIntelligence("meeting-1", "technology", "analysis")).rejects.toMatchObject({ status: 409 });
  });

  it("does not allow a stale provider response to overwrite a newer run", async () => {
    persistence.snapshot.data.mockReturnValue({
      workspaceId: "technology",
      analysis: { status: "processing", attempt: 2, runId: "new-run", startedAt: new Date() },
    });

    await expect(completeAnalysis("meeting-1", "expired-run", "meeting_transcript", "Transcript", {
      summary: "Stale output", decisions: [], risks: [], actionItems: [], followUps: [],
    })).resolves.toBe(false);
    expect(persistence.transactionUpdate).not.toHaveBeenCalled();
  });

  it("never replaces an already preserved raw transcript", async () => {
    persistence.snapshot.data.mockReturnValue({
      workspaceId: "technology",
      rawTranscript: "Original verbatim transcript",
      transcription: { status: "processing", attempt: 2, runId: "replacement-run", startedAt: new Date() },
    });

    await expect(completeTranscription("meeting-1", "replacement-run", "Replacement transcript"))
      .rejects.toThrow("cannot be replaced");
    expect(persistence.transactionUpdate).not.toHaveBeenCalled();
  });
});
