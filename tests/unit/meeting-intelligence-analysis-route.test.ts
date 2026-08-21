import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),
  begin: vi.fn(),
  complete: vi.fn(),
  fail: vi.fn(),
  get: vi.fn(),
  analyze: vi.fn(),
  availability: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/meeting-analysis", () => ({ analyzeMeetingTranscript: mocks.analyze, getAnalysisAvailability: mocks.availability }));
vi.mock("@/lib/meeting-intelligence-service", () => ({
  authorizeMeetingIntelligence: mocks.authorize,
  beginMeetingIntelligence: mocks.begin,
  completeAnalysis: mocks.complete,
  failMeetingIntelligence: mocks.fail,
  getMeetingIntelligence: mocks.get,
  MeetingIntelligenceConflictError: class MeetingIntelligenceConflictError extends Error { status = 409; },
}));
vi.mock("@/lib/custom-field-route-auth", () => ({ CustomFieldAuthError: class CustomFieldAuthError extends Error { constructor(message: string, public status: number) { super(message); } } }));

import { MeetingIntelligenceProviderError } from "@/lib/meeting-intelligence-provider";
import { POST } from "@/app/api/workspaces/[workspaceId]/meetings/[meetingId]/intelligence/analysis/route";

const context = { params: Promise.resolve({ workspaceId: "technology", meetingId: "meeting-1" }) };

describe("meeting analysis route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.availability.mockReturnValue({ available: true });
    mocks.begin.mockResolvedValue("run-1");
    mocks.complete.mockResolvedValue(true);
    mocks.fail.mockResolvedValue(undefined);
    mocks.authorize.mockResolvedValue({ id: "meeting-1", workspaceId: "technology", transcript: "Human-edited transcript" });
    mocks.get.mockResolvedValue({ rawTranscript: "Preserved Whisper transcript", analysis: { status: "completed" } });
    mocks.analyze.mockResolvedValue({ summary: "Summary", decisions: [], risks: [], actionItems: [], followUps: [] });
  });

  it("analyzes the preserved raw transcript without modifying notes or creating tasks", async () => {
    const response = await POST(new Request("http://local", { method: "POST" }), context);

    expect(response.status).toBe(200);
    expect(mocks.begin).toHaveBeenCalledWith("meeting-1", "technology", "analysis");
    expect(mocks.analyze).toHaveBeenCalledWith("Preserved Whisper transcript");
    expect(mocks.complete).toHaveBeenCalledWith("meeting-1", "run-1", "raw_transcript", "Preserved Whisper transcript", expect.objectContaining({ summary: "Summary" }));
  });

  it("falls back to the existing meeting transcript without overwriting it", async () => {
    mocks.get.mockResolvedValue({ rawTranscript: "" });
    await POST(new Request("http://local", { method: "POST" }), context);
    expect(mocks.analyze).toHaveBeenCalledWith("Human-edited transcript");
    expect(mocks.complete).toHaveBeenCalledWith("meeting-1", "run-1", "meeting_transcript", "Human-edited transcript", expect.anything());
  });

  it("persists safe failure state and permits a later POST retry", async () => {
    const error = new MeetingIntelligenceProviderError({ code: "provider_timeout", message: "The analysis service timed out. Try again.", retryable: true }, 504);
    mocks.analyze.mockRejectedValue(error);
    const response = await POST(new Request("http://local", { method: "POST" }), context);
    expect(response.status).toBe(504);
    expect(await response.json()).toMatchObject({ success: false, code: "provider_timeout", retryable: true });
    expect(mocks.fail).toHaveBeenCalledWith("meeting-1", "analysis", "run-1", error.detail);
  });

  it("moves unexpected post-start failures out of processing without exposing internals", async () => {
    mocks.analyze.mockRejectedValue(new Error("secret provider diagnostic"));
    const response = await POST(new Request("http://local", { method: "POST" }), context);
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ success: false, message: "Meeting analysis could not be completed." });
    expect(mocks.fail).toHaveBeenCalledWith("meeting-1", "analysis", "run-1", {
      code: "provider_error",
      message: "Meeting analysis failed unexpectedly. Try again.",
      retryable: true,
    });
  });
});
