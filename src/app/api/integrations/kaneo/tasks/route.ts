import "server-only";

import { NextResponse } from "next/server";

import { createKaneoWorkspaceTask, KaneoTaskCreateError } from "@/lib/kaneo-task-create";
import { getKaneoConfig, getKaneoTasks, KaneoError } from "@/lib/kaneo";
import { KaneoRoutingError, getKaneoProjectIdForWorkspace, getKaneoProjectKeyForWorkspace, type KaneoProjectKey } from "@/lib/kaneo-routing";
import { KaneoRouteAuthError, requireKaneoWorkspaceAccess } from "@/lib/kaneo-route-auth";
import {
  KaneoTaskMappingError,
  linkKaneoTaskToProveItTask,
  markKaneoTaskCreationOutcome,
  reserveKaneoTaskCreation,
} from "@/lib/kaneo-task-mapping";

function errorResponse(error: unknown) {
  if (error instanceof KaneoRouteAuthError || error instanceof KaneoError) return NextResponse.json({ success: false, message: error.message }, { status: error.status });
  if (error instanceof KaneoRoutingError) return NextResponse.json({ success: false, message: error.message }, { status: 422 });
  console.error("Kaneo tasks route failed", { errorType: typeof error });
  return NextResponse.json({ success: false, message: "Kaneo service is unavailable." }, { status: 503 });
}

const PRIORITIES = new Set(["low", "medium", "high", "urgent"]);

type WorkspaceTaskBody = {
  proveItTaskId: string;
  title: string;
  description?: string;
  priority?: "low" | "medium" | "high" | "urgent";
};

function response(body: Record<string, unknown>, status: number) {
  return NextResponse.json({ ...body, httpStatus: status }, { status });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function parseWorkspaceTaskBody(request: Request): Promise<WorkspaceTaskBody | null> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return null;
  }

  if (!isRecord(body) || Object.keys(body).some((key) =>
    key !== "proveItTaskId" && key !== "title" && key !== "description" && key !== "priority"
  )) return null;

  if (typeof body.proveItTaskId !== "string" || !body.proveItTaskId.trim() || typeof body.title !== "string" || !body.title.trim()) return null;
  if (body.description !== undefined && typeof body.description !== "string") return null;
  if (body.priority !== undefined &&
    (typeof body.priority !== "string" || !PRIORITIES.has(body.priority))) return null;

  return {
    proveItTaskId: body.proveItTaskId.trim(),
    title: body.title.trim(),
    ...(body.description === undefined ? {} : { description: body.description.trim() }),
    ...(body.priority === undefined ? {} : { priority: body.priority as WorkspaceTaskBody["priority"] }),
  };
}

function productionErrorResponse(error: unknown) {
  if (error instanceof KaneoRouteAuthError) {
    return response({ success: false, message: error.message }, error.status);
  }
  if (error instanceof KaneoTaskMappingError) {
    return response({ success: false, message: error.status === 409
      ? error.message
      : "Kaneo task was created, but its ProveIt link could not be confirmed." }, error.status);
  }
  if (error instanceof KaneoRoutingError) {
    return response({ success: false, message: "Workspace routing is unavailable." }, 422);
  }
  if (error instanceof KaneoError && (error.category === "network" || error.category === "timeout")) {
    return response({
      success: false,
      message: "Kaneo task creation outcome is ambiguous and will not be retried automatically.",
    }, 503);
  }
  if (error instanceof KaneoError || error instanceof KaneoTaskCreateError) {
    return response({ success: false, message: error.message }, error.status);
  }

  return response({ success: false, message: "Kaneo task could not be created." }, 503);
}

export async function GET(request: Request) {
  try {
    const workspaceId = new URL(request.url).searchParams.get("workspaceId")?.trim();
    if (!workspaceId) return NextResponse.json({ success: false, message: "workspaceId is required." }, { status: 422 });
    await requireKaneoWorkspaceAccess(request, workspaceId);
    const config = getKaneoConfig();
    const projectId = getKaneoProjectIdForWorkspace(workspaceId, config.projects);
    const tasks = await getKaneoTasks(projectId, { config });
    return NextResponse.json({ success: true, projectId, tasks });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  const body = await parseWorkspaceTaskBody(request);
  if (!body) {
    return response({ success: false, message: "A valid workspace task is required." }, 422);
  }

  try {
    const requestedWorkspaceId = new URL(request.url).searchParams.get("workspaceId")?.trim() || "business";
    const workspaceId: KaneoProjectKey = getKaneoProjectKeyForWorkspace(requestedWorkspaceId);
    const user = await requireKaneoWorkspaceAccess(request, workspaceId);
    const config = getKaneoConfig();
    const projectId = getKaneoProjectIdForWorkspace(workspaceId, config.projects);
    const isBod = user.profile.role === "bod" || user.profile.group === "bod";
    await reserveKaneoTaskCreation(body.proveItTaskId, user.uid, workspaceId, projectId, body, isBod);
    let task;
    try {
      task = await createKaneoWorkspaceTask(workspaceId, body, { config });
    } catch (error) {
      const state = error instanceof KaneoError && (error.category === "network" || error.category === "timeout")
        ? "ambiguous"
        : "failed";
      try {
        await markKaneoTaskCreationOutcome(body.proveItTaskId, user.uid, workspaceId, projectId, state);
      } catch {
        // The existing task-level mapping claim remains a duplicate-prevention boundary.
      }
      throw error;
    }
    try {
      await linkKaneoTaskToProveItTask(body.proveItTaskId, user.uid, workspaceId, {
        taskId: task.id,
        projectId: task.projectId,
      });
    } catch (error) {
      try {
        await markKaneoTaskCreationOutcome(body.proveItTaskId, user.uid, workspaceId, projectId, "ambiguous");
      } catch {
        // The pre-create task-level mapping claim prevents an unsafe retry.
      }
      throw error;
    }
    return response({
      success: true,
      kaneoTaskId: task.id,
      projectId: task.projectId,
      title: task.title,
      status: task.status,
      priority: task.priority,
      message: "Kaneo task created.",
    }, 200);
  } catch (error) {
    return productionErrorResponse(error);
  }
}
