import "server-only";

import { NextResponse } from "next/server";

import { KaneoRouteAuthError, requireKaneoWorkspaceDeleteAccess } from "@/lib/kaneo-route-auth";
import { runControlledWorkspaceSyncTest } from "@/lib/kaneo-controlled-verification";
import { getKaneoProjectKeyForWorkspace } from "@/lib/kaneo-routing";

function disabled() {
  return NextResponse.json({ success: false, message: "Controlled verification is available only in development." }, { status: 404 });
}

export async function POST(request: Request) {
  if (process.env.NODE_ENV !== "development") return disabled();
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ success: false, message: "Invalid controlled verification request." }, { status: 422 }); }
  if (typeof body !== "object" || body === null || Array.isArray(body) || Object.keys(body).length !== 1) {
    return NextResponse.json({ success: false, message: "Invalid controlled verification request." }, { status: 422 });
  }
  try {
    const workspaceId = getKaneoProjectKeyForWorkspace(new URL(request.url).searchParams.get("workspaceId")?.trim() || "business");
    const expectedConfirmation = workspaceId === "business" ? "RUN_CONTROLLED_BUSINESS_SYNC_TEST" : "RUN_CONTROLLED_TECHNOLOGY_SYNC_TEST";
    if ((body as { confirmation?: unknown }).confirmation !== expectedConfirmation) {
      return NextResponse.json({ success: false, message: "Invalid controlled verification request." }, { status: 422 });
    }
    const user = await requireKaneoWorkspaceDeleteAccess(request, workspaceId);
    const result = await runControlledWorkspaceSyncTest(request, user.uid, workspaceId);
    return NextResponse.json({ success: result.message === "Controlled Workspace Sync Test completed.", result, message: result.message }, { status: 200 });
  } catch (error) {
    if (error instanceof KaneoRouteAuthError) {
      return NextResponse.json({ success: false, mutationAttempted: false, message: error.message }, { status: error.status });
    }
    return NextResponse.json({ success: false, mutationAttempted: false, message: "Controlled verification is unavailable." }, { status: 503 });
  }
}
