import "server-only";

import { NextResponse } from "next/server";

import { getKaneoColumns, getKaneoConfig, KaneoError } from "@/lib/kaneo";
import { KaneoRoutingError, getKaneoProjectIdForWorkspace } from "@/lib/kaneo-routing";
import { KaneoRouteAuthError, requireKaneoWorkspaceAccess } from "@/lib/kaneo-route-auth";

function response(body: Record<string, unknown>, status: number) {
  return NextResponse.json({ ...body, httpStatus: status }, { status });
}

function errorResponse(error: unknown) {
  if (error instanceof KaneoRouteAuthError) {
    return response({ success: false, message: error.message }, error.status);
  }
  if (error instanceof KaneoRoutingError) {
    return response({ success: false, message: error.message }, 422);
  }
  if (error instanceof KaneoError) {
    return response({
      success: false,
      message: error.message,
      diagnosticCategory: `column_${error.category}`,
    }, error.status);
  }

  console.error("Kaneo columns route failed", { errorType: typeof error });
  return response({
    success: false,
    message: "Kaneo service is unavailable.",
    diagnosticCategory: "column_unknown",
  }, 503);
}

export async function GET(request: Request) {
  try {
    const workspaceId = new URL(request.url).searchParams.get("workspaceId")?.trim();
    if (!workspaceId) {
      return response({ success: false, message: "workspaceId is required." }, 422);
    }

    await requireKaneoWorkspaceAccess(request, workspaceId);
    const config = getKaneoConfig();
    const projectId = getKaneoProjectIdForWorkspace(workspaceId, config.projects);
    const columns = await getKaneoColumns(projectId, { config });

    return response({
      success: true,
      projectId,
      columns: columns.map(({ name, slug }) => ({ name, slug })),
      toDoExists: columns.some((column) => column.slug === "to-do"),
    }, 200);
  } catch (error) {
    return errorResponse(error);
  }
}
