import "server-only";

import { NextResponse } from "next/server";

import { KaneoRouteAuthError, requireKaneoBusinessDeleteAccess } from "@/lib/kaneo-route-auth";
import { runControlledBusinessSyncTest } from "@/lib/kaneo-controlled-verification";

function disabled() { return NextResponse.json({ success: false, message: "Controlled verification is available only in development." }, { status: 404 }); }

export async function POST(request: Request) {
  if (process.env.NODE_ENV !== "development") return disabled();
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ success: false, message: "Invalid controlled verification request." }, { status: 422 }); }
  if (typeof body !== "object" || body === null || Array.isArray(body) || Object.keys(body).length !== 1 || (body as { confirmation?: unknown }).confirmation !== "RUN_CONTROLLED_BUSINESS_SYNC_TEST") return NextResponse.json({ success: false, message: "Invalid controlled verification request." }, { status: 422 });
  try {
    const user = await requireKaneoBusinessDeleteAccess(request);
    const result = await runControlledBusinessSyncTest(request, user.uid);
    return NextResponse.json({ success: result.message === "Controlled Business Sync Test completed.", result, message: result.message }, { status: 200 });
  } catch (error) {
    if (error instanceof KaneoRouteAuthError) {
      const stage = error.message === "Workspace access required." ? "business_access_verification_failed" : error.message === "Business task deletion requires BOD access." ? "bod_verification_failed" : error.message === "Active employee account required." ? "active_profile_verification_failed" : "firebase_authentication_failed";
      return NextResponse.json({ success: false, stage, mutationAttempted: false, message: error.message }, { status: error.status });
    }
    return NextResponse.json({ success: false, stage: "request_received", mutationAttempted: false, message: "Controlled verification is unavailable." }, { status: 503 });
  }
}
