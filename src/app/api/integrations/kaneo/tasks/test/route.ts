import "server-only";

import { NextResponse } from "next/server";

import { requireBOD, AdminAuthError } from "@/lib/admin-auth";
import {
  failDisposableKaneoTest,
  type KaneoIntegrationErrorCategory,
  linkDisposableKaneoTest,
  markDisposableKaneoTestAttempt,
  requireDisposableKaneoTestReconciliation,
  reserveDisposableKaneoTest,
} from "@/lib/kaneo-integrations";
import { getKaneoConfig, KaneoError } from "@/lib/kaneo";
import { KaneoRoutingError, getKaneoProjectIdForWorkspace } from "@/lib/kaneo-routing";
import { KaneoRouteAuthError, requireKaneoWorkspaceAccess } from "@/lib/kaneo-route-auth";
import {
  createDisposableKaneoTask,
  KaneoTaskCreateError,
  preflightDisposableKaneoTask,
} from "@/lib/kaneo-task-create";

const CONFIRMATION = "CREATE_DISPOSABLE_KANEO_TEST_TASK";
const BUSINESS_WORKSPACE_ID = "business";

type PreflightDiagnosticCategory =
  | "column_preflight_network"
  | "column_preflight_timeout"
  | "column_preflight_upstream_4xx"
  | "column_preflight_upstream_5xx"
  | "column_preflight_malformed_response"
  | "column_preflight_missing_to_do"
  | "column_preflight_unknown";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function hasValidConfirmation(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return false;
  }

  return isRecord(body) && Object.keys(body).length === 1 &&
    body.confirmation === CONFIRMATION;
}

function response(
  body: Record<string, unknown>,
  status: number
) {
  return NextResponse.json({ ...body, httpStatus: status }, { status });
}

async function markAmbiguousOutcome(category: KaneoIntegrationErrorCategory) {
  try {
    await requireDisposableKaneoTestReconciliation(category);
  } catch (error) {
    console.error("Kaneo disposable test reconciliation marking failed", {
      errorType: typeof error,
    });
  }
}

function preflightDiagnosticCategory(error: unknown): PreflightDiagnosticCategory {
  if (error instanceof KaneoTaskCreateError) {
    return "column_preflight_missing_to_do";
  }

  if (error instanceof KaneoError) {
    switch (error.category) {
      case "timeout":
        return "column_preflight_timeout";
      case "upstream_4xx":
        return "column_preflight_upstream_4xx";
      case "upstream_5xx":
        return "column_preflight_upstream_5xx";
      case "malformed_response":
        return "column_preflight_malformed_response";
      case "network":
      case "configuration":
        return "column_preflight_network";
    }
  }

  return "column_preflight_unknown";
}

function preflightFailureResponse(error: unknown) {
  const diagnosticCategory = preflightDiagnosticCategory(error);
  const status = error instanceof KaneoError || error instanceof KaneoTaskCreateError
    ? error.status
    : 503;
  const message = error instanceof KaneoError || error instanceof KaneoTaskCreateError
    ? error.message
    : "Kaneo service is unavailable.";

  return response({ success: false, message, diagnosticCategory }, status);
}

export async function POST(request: Request) {
  try {
    if (!await hasValidConfirmation(request)) {
      return response({ success: false, message: "A valid disposable test confirmation is required." }, 422);
    }

    await requireBOD(request, "create-disposable-kaneo-test-task");
    await requireKaneoWorkspaceAccess(request, BUSINESS_WORKSPACE_ID);

    const config = getKaneoConfig();
    const projectId = getKaneoProjectIdForWorkspace(
      BUSINESS_WORKSPACE_ID,
      config.projects
    );

    try {
      await preflightDisposableKaneoTask(projectId, { config });
    } catch (error) {
      return preflightFailureResponse(error);
    }

    let reservation;
    try {
      reservation = await reserveDisposableKaneoTest(projectId);
    } catch (error) {
      console.error("Kaneo disposable test reservation failed", {
        errorType: typeof error,
      });
      return response({
        success: false,
        diagnosticCategory: "reservation_failed",
        message: "Kaneo service is unavailable.",
      }, 503);
    }
    if (!reservation.canCreate) {
      return response({
        success: false,
        state: reservation.state,
        message: "The disposable Kaneo test has already been reserved and will not be created again.",
      }, 409);
    }

    try {
      await markDisposableKaneoTestAttempt();
    } catch (error) {
      console.error("Kaneo disposable test attempt marking failed", {
        errorType: typeof error,
      });
      return response({
        success: false,
        state: "pending",
        message: "The disposable Kaneo test is reserved and requires manual review.",
      }, 503);
    }

    let task;
    try {
      task = await createDisposableKaneoTask(projectId, { config });
    } catch (error) {
      if (error instanceof KaneoError && error.category === "upstream_4xx") {
        await failDisposableKaneoTest("upstream_4xx");
        return response({ success: false, state: "failed", message: error.message }, error.status);
      }

      const category = error instanceof KaneoError &&
        error.category !== "network" && error.category !== "configuration"
        ? error.category
        : error instanceof KaneoTaskCreateError
          ? "malformed_response"
          : "ambiguous_result";
      await markAmbiguousOutcome(category);
      return response({
        success: false,
        state: "reconciliation_required",
        message: "The Kaneo create outcome requires reconciliation and will not be retried automatically.",
      }, 503);
    }

    try {
      await linkDisposableKaneoTest(task.id);
    } catch (error) {
      console.error("Kaneo disposable test linking failed", {
        errorType: typeof error,
      });
      await markAmbiguousOutcome("mapping_write_failed");
      return response({
        success: false,
        state: "reconciliation_required",
        message: "The Kaneo create outcome requires reconciliation and will not be retried automatically.",
      }, 503);
    }

    return response({
      success: true,
      kaneoTaskId: task.id,
      projectId: task.projectId,
      title: task.title,
      status: task.status,
      priority: task.priority,
      state: "linked",
      message: "Disposable Kaneo test task created and linked.",
    }, 200);
  } catch (error) {
    if (error instanceof AdminAuthError || error instanceof KaneoRouteAuthError ||
      error instanceof KaneoError || error instanceof KaneoTaskCreateError) {
      return response({ success: false, message: error.message }, error.status);
    }
    if (error instanceof KaneoRoutingError) {
      return response({ success: false, message: error.message }, 422);
    }

    console.error("Kaneo disposable test route failed", { errorType: typeof error });
    return response({ success: false, message: "Kaneo service is unavailable." }, 503);
  }
}
