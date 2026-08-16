import { NextResponse } from "next/server";
import { getKaneoConfig, KaneoError } from "@/lib/kaneo";
import { requireKaneoWorkspaceDeleteAccess, requireKaneoWorkspaceAccess, KaneoRouteAuthError } from "@/lib/kaneo-route-auth";
import { deleteMappedWorkspaceTask, syncMappedWorkspaceTask } from "@/lib/kaneo-task-update";
import { getKaneoProjectKeyForWorkspace } from "@/lib/kaneo-routing";

type Context = { params: Promise<{ taskId: string }> };
function failure(error: unknown) { if (error instanceof KaneoRouteAuthError) return NextResponse.json({ success: false, message: error.message }, { status: error.status }); if (error instanceof KaneoError) return NextResponse.json({ success: false, message: error.category === "network" || error.category === "timeout" ? "External sync could not be confirmed." : "External sync failed." }, { status: error.status }); return NextResponse.json({ success: false, message: "External sync failed." }, { status: 503 }); }

export async function PATCH(request: Request, context: Context) {
  try { const { taskId } = await context.params; const workspaceId = getKaneoProjectKeyForWorkspace(new URL(request.url).searchParams.get("workspaceId")?.trim() || "business"); await requireKaneoWorkspaceAccess(request, workspaceId); const body = await request.json() as { fields?: unknown }; if (!body || Object.keys(body).length !== 1) return NextResponse.json({ success: false, message: "Invalid sync request." }, { status: 422 }); const result = await syncMappedWorkspaceTask(taskId, workspaceId, body.fields, getKaneoConfig().projects); return NextResponse.json({ success: result.state === "synced", state: result.state, message: result.message }, { status: 200 }); }
  catch (error) { return failure(error); }
}

export async function DELETE(request: Request, context: Context) {
  try { const { taskId } = await context.params; const workspaceId = getKaneoProjectKeyForWorkspace(new URL(request.url).searchParams.get("workspaceId")?.trim() || "business"); await requireKaneoWorkspaceDeleteAccess(request, workspaceId); const result = await deleteMappedWorkspaceTask(taskId, workspaceId, getKaneoConfig().projects); return NextResponse.json({ success: result.state === "synced", state: result.state, message: result.state === "synced" ? "External task deleted." : "External sync is not configured for this task." }, { status: 200 }); }
  catch (error) { return failure(error); }
}
