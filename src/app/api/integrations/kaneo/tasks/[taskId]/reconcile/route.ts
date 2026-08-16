import { NextResponse } from "next/server";

import { getKaneoConfig, KaneoError } from "@/lib/kaneo";
import { requireKaneoWorkspaceDeleteAccess, KaneoRouteAuthError } from "@/lib/kaneo-route-auth";
import { getKaneoProjectKeyForWorkspace } from "@/lib/kaneo-routing";
import {
  attachUniqueReconciledKaneoTask,
  inspectAmbiguousKaneoTask,
  permitKaneoTaskRetryAfterNoMatch,
  reconciliationErrorResponse,
} from "@/lib/kaneo-task-reconciliation";

type Context = { params: Promise<{ taskId: string }> };

const UNIQUE_CONFIRMATION = "CONFIRM_UNIQUE_KANEO_MATCH";
const NO_MATCH_CONFIRMATION = "CONFIRM_NO_KANEO_MATCH";

function failure(error: unknown) {
  if (error instanceof KaneoRouteAuthError) {
    return NextResponse.json({ success: false, message: error.message }, { status: error.status });
  }
  if (error instanceof KaneoError) {
    return NextResponse.json({ success: false, message: "Kaneo reconciliation could not be completed." }, { status: error.status });
  }
  const normalized = reconciliationErrorResponse(error);
  return NextResponse.json({ success: false, message: normalized.message }, { status: normalized.status });
}

export async function GET(request: Request, context: Context) {
  try {
    const workspaceId = getKaneoProjectKeyForWorkspace(new URL(request.url).searchParams.get("workspaceId")?.trim() || "business");
    await requireKaneoWorkspaceDeleteAccess(request, workspaceId);
    const { taskId } = await context.params;
    const inspection = await inspectAmbiguousKaneoTask(taskId, workspaceId, getKaneoConfig());
    const matchCount = inspection.matchingTaskIds.length;
    return NextResponse.json({
      success: true,
      state: "ambiguous",
      projectId: inspection.projectId,
      matchCount,
      canAttachUniqueMatch: matchCount === 1,
      canPermitRetry: matchCount === 0,
      message: matchCount === 1
        ? "One matching Kaneo task was found. BOD confirmation is required to attach it."
        : matchCount === 0
          ? "No matching Kaneo task was found. BOD confirmation is required before one manual retry can be permitted."
          : "Multiple matching Kaneo tasks were found. No mapping or retry is permitted.",
    });
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request, context: Context) {
  let body: { action?: unknown; confirmation?: unknown };
  try {
    body = await request.json() as { action?: unknown; confirmation?: unknown };
  } catch {
    return NextResponse.json({ success: false, message: "Invalid Kaneo reconciliation request." }, { status: 422 });
  }
  if (!body || Object.keys(body).length !== 2 || typeof body.action !== "string" || typeof body.confirmation !== "string") {
    return NextResponse.json({ success: false, message: "Invalid Kaneo reconciliation request." }, { status: 422 });
  }

  try {
    const workspaceId = getKaneoProjectKeyForWorkspace(new URL(request.url).searchParams.get("workspaceId")?.trim() || "business");
    await requireKaneoWorkspaceDeleteAccess(request, workspaceId);
    const { taskId } = await context.params;
    const inspection = await inspectAmbiguousKaneoTask(taskId, workspaceId, getKaneoConfig());

    if (body.action === "attach_unique_match" && body.confirmation === UNIQUE_CONFIRMATION) {
      if (inspection.matchingTaskIds.length !== 1) {
        return NextResponse.json({ success: false, message: "A unique Kaneo match could not be confirmed." }, { status: 409 });
      }
      await attachUniqueReconciledKaneoTask(taskId, workspaceId, inspection.projectId, inspection.matchingTaskIds[0]);
      return NextResponse.json({ success: true, state: "synced", kaneoTaskId: inspection.matchingTaskIds[0], message: "The unique Kaneo task mapping was confirmed." });
    }

    if (body.action === "permit_retry_after_no_match" && body.confirmation === NO_MATCH_CONFIRMATION) {
      if (inspection.matchingTaskIds.length !== 0) {
        return NextResponse.json({ success: false, message: "Kaneo matches still exist; another create is not permitted." }, { status: 409 });
      }
      await permitKaneoTaskRetryAfterNoMatch(taskId, workspaceId, inspection.projectId);
      return NextResponse.json({ success: true, state: "retry_permitted", message: "One later manual Business create attempt is permitted. No Kaneo request was sent." });
    }

    return NextResponse.json({ success: false, message: "Invalid Kaneo reconciliation request." }, { status: 422 });
  } catch (error) {
    return failure(error);
  }
}
