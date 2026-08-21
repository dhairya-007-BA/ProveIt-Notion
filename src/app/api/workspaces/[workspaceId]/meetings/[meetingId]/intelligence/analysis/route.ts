import { NextResponse } from "next/server";

import { analyzeMeetingTranscript, getAnalysisAvailability } from "@/lib/meeting-analysis";
import { meetingIntelligenceErrorResponse } from "@/lib/meeting-intelligence-route";
import { MeetingIntelligenceProviderError } from "@/lib/meeting-intelligence-provider";
import {
  authorizeMeetingIntelligence,
  beginMeetingIntelligence,
  completeAnalysis,
  failMeetingIntelligence,
  getMeetingIntelligence,
  MeetingIntelligenceConflictError,
} from "@/lib/meeting-intelligence-service";

export const runtime = "nodejs";

type Context = { params: Promise<{ workspaceId: string; meetingId: string }> };

export async function POST(request: Request, context: Context) {
  let meetingId = "";
  let runId = "";
  try {
    const { workspaceId, meetingId: requestedMeetingId } = await context.params;
    meetingId = requestedMeetingId;
    const meeting = await authorizeMeetingIntelligence(request, workspaceId, meetingId);
    if (!getAnalysisAvailability().available) throw new MeetingIntelligenceProviderError({ code: "provider_unavailable", message: "Ollama meeting analysis is not configured.", retryable: false }, 503);
    const current = await getMeetingIntelligence(meetingId, workspaceId);
    const rawTranscript = current.rawTranscript.trim();
    const meetingTranscript = meeting.transcript.trim();
    const transcript = rawTranscript || meetingTranscript;
    const inputSource = rawTranscript ? "raw_transcript" as const : "meeting_transcript" as const;
    if (!transcript) return NextResponse.json({ success: false, message: "Add or generate a transcript before running analysis." }, { status: 422 });
    runId = await beginMeetingIntelligence(meetingId, workspaceId, "analysis");
    const output = await analyzeMeetingTranscript(transcript);
    const completed = await completeAnalysis(meetingId, runId, inputSource, transcript, output);
    if (!completed) throw new MeetingIntelligenceConflictError("A newer analysis attempt has already started.");
    return NextResponse.json({ success: true, intelligence: await getMeetingIntelligence(meetingId, workspaceId) });
  } catch (error) {
    if (runId) {
      const detail = error instanceof MeetingIntelligenceProviderError ? error.detail : { code: "provider_error" as const, message: "Meeting analysis failed unexpectedly. Try again.", retryable: true };
      await failMeetingIntelligence(meetingId, "analysis", runId, detail).catch(() => undefined);
    }
    return meetingIntelligenceErrorResponse(error, "Meeting analysis could not be completed.");
  }
}
