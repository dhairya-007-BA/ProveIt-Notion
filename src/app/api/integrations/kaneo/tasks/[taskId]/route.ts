import { NextResponse } from "next/server";
import { getKaneoConfig, KaneoError } from "@/lib/kaneo";
import { requireKaneoBusinessDeleteAccess, requireKaneoWorkspaceAccess, KaneoRouteAuthError } from "@/lib/kaneo-route-auth";
import { deleteMappedBusinessTask, syncMappedBusinessTask } from "@/lib/kaneo-task-update";

type Context = { params: Promise<{ taskId: string }> };
function failure(error: unknown) { if (error instanceof KaneoRouteAuthError) return NextResponse.json({ success: false, message: error.message }, { status: error.status }); if (error instanceof KaneoError) return NextResponse.json({ success: false, message: error.category === "network" || error.category === "timeout" ? "External sync could not be confirmed." : "External sync failed." }, { status: error.status }); return NextResponse.json({ success: false, message: "External sync failed." }, { status: 503 }); }

export async function PATCH(request: Request, context: Context) {
  try { const { taskId } = await context.params; await requireKaneoWorkspaceAccess(request, "business"); const body = await request.json() as { fields?: unknown }; if (!body || Object.keys(body).length !== 1) return NextResponse.json({ success: false, message: "Invalid sync request." }, { status: 422 }); const result = await syncMappedBusinessTask(taskId, body.fields, getKaneoConfig().projects); return NextResponse.json({ success: result.state === "synced", state: result.state, message: result.message }, { status: 200 }); }
  catch (error) { return failure(error); }
}

export async function DELETE(request: Request, context: Context) {
  try { const { taskId } = await context.params; await requireKaneoBusinessDeleteAccess(request); const result = await deleteMappedBusinessTask(taskId, getKaneoConfig().projects); return NextResponse.json({ success: result.state === "synced", state: result.state, message: result.state === "synced" ? "External task deleted." : "External sync is not configured for this task." }, { status: 200 }); }
  catch (error) { return failure(error); }
}
