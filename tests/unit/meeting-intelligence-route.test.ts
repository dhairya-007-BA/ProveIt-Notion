import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),
  get: vi.fn(),
  transcriptionAvailability: vi.fn(),
  analysisAvailability: vi.fn(),
}));

const CustomFieldAuthError = vi.hoisted(() => class CustomFieldAuthError extends Error {
  constructor(message: string, public status: number) { super(message); }
});

vi.mock("server-only", () => ({}));
vi.mock("@/lib/custom-field-route-auth", () => ({ CustomFieldAuthError }));
vi.mock("@/lib/meeting-intelligence-service", () => ({
  authorizeMeetingIntelligence: mocks.authorize,
  getMeetingIntelligence: mocks.get,
  MeetingIntelligenceConflictError: class MeetingIntelligenceConflictError extends Error { status = 409; },
}));
vi.mock("@/lib/meeting-transcription", () => ({ getTranscriptionAvailability: mocks.transcriptionAvailability }));
vi.mock("@/lib/meeting-analysis", () => ({ getAnalysisAvailability: mocks.analysisAvailability }));

import { GET } from "@/app/api/workspaces/[workspaceId]/meetings/[meetingId]/intelligence/route";

const context = { params: Promise.resolve({ workspaceId: "technology", meetingId: "meeting-1" }) };

describe("meeting intelligence read route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authorize.mockResolvedValue({ id: "meeting-1", workspaceId: "technology", transcript: "" });
    mocks.get.mockResolvedValue({ meetingId: "meeting-1", workspaceId: "technology" });
    mocks.transcriptionAvailability.mockReturnValue({ available: false, message: "Whisper transcription is not configured." });
    mocks.analysisAvailability.mockReturnValue({ available: false, message: "Ollama meeting analysis is not configured." });
  });

  it("authorizes both workspace and meeting before returning server-owned state", async () => {
    const response = await GET(new Request("http://local", { headers: { Authorization: "Bearer token" } }), context);
    expect(response.status).toBe(200);
    expect(mocks.authorize).toHaveBeenCalledWith(expect.any(Request), "technology", "meeting-1");
    expect(await response.json()).toMatchObject({
      success: true,
      intelligence: { meetingId: "meeting-1", workspaceId: "technology" },
      availability: { transcription: { available: false }, analysis: { available: false } },
    });
  });

  it("fails closed without reading intelligence when workspace access is denied", async () => {
    mocks.authorize.mockRejectedValue(new CustomFieldAuthError("Workspace access required.", 403));
    const response = await GET(new Request("http://local"), context);
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ success: false, message: "Workspace access required." });
    expect(mocks.get).not.toHaveBeenCalled();
  });
});
