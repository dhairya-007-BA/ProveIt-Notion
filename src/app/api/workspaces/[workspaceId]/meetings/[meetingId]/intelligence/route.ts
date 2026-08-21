import { NextResponse } from "next/server";

import { getAnalysisAvailability } from "@/lib/meeting-analysis";
import { meetingIntelligenceErrorResponse } from "@/lib/meeting-intelligence-route";
import { authorizeMeetingIntelligence, getMeetingIntelligence } from "@/lib/meeting-intelligence-service";
import { getTranscriptionAvailability } from "@/lib/meeting-transcription";

export const runtime = "nodejs";

type Context = { params: Promise<{ workspaceId: string; meetingId: string }> };

export async function GET(request: Request, context: Context) {
  try {
    const { workspaceId, meetingId } = await context.params;
    await authorizeMeetingIntelligence(request, workspaceId, meetingId);
    const intelligence = await getMeetingIntelligence(meetingId, workspaceId);
    return NextResponse.json({
      success: true,
      intelligence,
      availability: {
        transcription: getTranscriptionAvailability(),
        analysis: getAnalysisAvailability(),
      },
    });
  } catch (error) {
    return meetingIntelligenceErrorResponse(error, "Meeting intelligence could not be loaded.");
  }
}
