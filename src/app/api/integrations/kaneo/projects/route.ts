import "server-only";

import { NextResponse } from "next/server";

import { getKaneoConfig, getKaneoProject, KaneoError } from "@/lib/kaneo";
import { KaneoRoutingError, getKaneoProjectIdForWorkspace } from "@/lib/kaneo-routing";
import { KaneoRouteAuthError, requireKaneoWorkspaceAccess } from "@/lib/kaneo-route-auth";

function errorResponse(error: unknown) {
  if (error instanceof KaneoRouteAuthError || error instanceof KaneoError) return NextResponse.json({ success: false, message: error.message }, { status: error.status });
  if (error instanceof KaneoRoutingError) return NextResponse.json({ success: false, message: error.message }, { status: 422 });
  console.error("Kaneo projects route failed", { errorType: typeof error });
  return NextResponse.json({ success: false, message: "Kaneo service is unavailable." }, { status: 503 });
}

export async function GET(request: Request) {
  try {
    const workspaceId = new URL(request.url).searchParams.get("workspaceId")?.trim();
    if (!workspaceId) return NextResponse.json({ success: false, message: "workspaceId is required." }, { status: 422 });
    await requireKaneoWorkspaceAccess(request, workspaceId);
    const config = getKaneoConfig();
    const project = await getKaneoProject(getKaneoProjectIdForWorkspace(workspaceId, config.projects), { config });
    return NextResponse.json({ success: true, project });
  } catch (error) {
    return errorResponse(error);
  }
}
