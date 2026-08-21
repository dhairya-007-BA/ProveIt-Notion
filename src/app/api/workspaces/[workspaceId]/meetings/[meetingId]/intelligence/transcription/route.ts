import { NextResponse } from "next/server";

import { meetingIntelligenceErrorResponse } from "@/lib/meeting-intelligence-route";
import { MeetingIntelligenceProviderError } from "@/lib/meeting-intelligence-provider";
import {
  authorizeMeetingIntelligence,
  beginMeetingIntelligence,
  completeTranscription,
  failMeetingIntelligence,
  getMeetingIntelligence,
  MeetingIntelligenceConflictError,
} from "@/lib/meeting-intelligence-service";
import { getTranscriptionAvailability, transcribeMeetingAudio } from "@/lib/meeting-transcription";

export const runtime = "nodejs";

const MAX_AUDIO_BYTES = 25 * 1024 * 1024;
type Context = { params: Promise<{ workspaceId: string; meetingId: string }> };

export async function POST(request: Request, context: Context) {
  let meetingId = "";
  let runId = "";
  try {
    const params = await context.params;
    meetingId = params.meetingId;
    await authorizeMeetingIntelligence(request, params.workspaceId, meetingId);
    if (!getTranscriptionAvailability().available) throw new MeetingIntelligenceProviderError({ code: "provider_unavailable", message: "Whisper transcription is not configured.", retryable: false }, 503);
    const existing = await getMeetingIntelligence(meetingId, params.workspaceId);
    if (existing.rawTranscript.trim()) return NextResponse.json({ success: false, message: "The preserved raw transcript cannot be replaced." }, { status: 409 });
    const form = await request.formData().catch(() => null);
    const audio = form?.get("audio");
    if (!(audio instanceof Blob) || audio.size === 0 || audio.size > MAX_AUDIO_BYTES || (!audio.type.startsWith("audio/") && audio.type !== "video/webm")) {
      return NextResponse.json({ success: false, message: "Provide an audio file of 25 MB or less." }, { status: 422 });
    }
    const suppliedName = "name" in audio && typeof audio.name === "string" ? audio.name : "meeting-audio";
    const filename = suppliedName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 160) || "meeting-audio";
    runId = await beginMeetingIntelligence(meetingId, params.workspaceId, "transcription");
    const transcript = await transcribeMeetingAudio(audio, filename);
    const completed = await completeTranscription(meetingId, runId, transcript);
    if (!completed) throw new MeetingIntelligenceConflictError("A newer transcription attempt has already started.");
    return NextResponse.json({ success: true, intelligence: await getMeetingIntelligence(meetingId, params.workspaceId) });
  } catch (error) {
    if (runId) {
      const detail = error instanceof MeetingIntelligenceProviderError ? error.detail : { code: "provider_error" as const, message: "Meeting transcription failed unexpectedly. Try again.", retryable: true };
      await failMeetingIntelligence(meetingId, "transcription", runId, detail).catch(() => undefined);
    }
    return meetingIntelligenceErrorResponse(error, "Meeting transcription could not be completed.");
  }
}
