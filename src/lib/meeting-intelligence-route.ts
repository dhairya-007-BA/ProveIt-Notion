import "server-only";

import { NextResponse } from "next/server";

import { CustomFieldAuthError } from "@/lib/custom-field-route-auth";
import { MeetingIntelligenceConflictError } from "@/lib/meeting-intelligence-service";
import { MeetingIntelligenceProviderError } from "@/lib/meeting-intelligence-provider";

export function meetingIntelligenceErrorResponse(error: unknown, fallback: string) {
  if (error instanceof CustomFieldAuthError || error instanceof MeetingIntelligenceConflictError) {
    return NextResponse.json({ success: false, message: error.message }, { status: error.status });
  }
  if (error instanceof MeetingIntelligenceProviderError) {
    return NextResponse.json({ success: false, message: error.detail.message, code: error.detail.code, retryable: error.detail.retryable }, { status: error.httpStatus });
  }
  return NextResponse.json({ success: false, message: fallback }, { status: 500 });
}
