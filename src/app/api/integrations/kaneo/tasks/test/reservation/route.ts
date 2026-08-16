import "server-only";

import { NextResponse } from "next/server";

import { requireBOD, AdminAuthError } from "@/lib/admin-auth";
import { adminDb } from "@/lib/firebase-admin";
import {
  DISPOSABLE_KANEO_TEST_IDEMPOTENCY_KEY,
  DISPOSABLE_KANEO_TEST_MAPPING_ID,
} from "@/lib/kaneo-integrations";
import { getKaneoConfig } from "@/lib/kaneo";
import { KaneoRoutingError, getKaneoProjectIdForWorkspace } from "@/lib/kaneo-routing";
import { KaneoRouteAuthError, requireKaneoWorkspaceAccess } from "@/lib/kaneo-route-auth";
import { DISPOSABLE_KANEO_TEST_MARKER } from "@/lib/kaneo-task-create";

const BUSINESS_WORKSPACE_ID = "business";
const STATES = new Set(["pending", "linked", "reconciliation_required", "failed"]);
const ERROR_CATEGORIES = new Set([
  "timeout",
  "upstream_4xx",
  "upstream_5xx",
  "malformed_response",
  "mapping_write_failed",
  "ambiguous_result",
]);

type SafeReservation = {
  provider: "kaneo";
  proveItTaskId: string;
  proveItWorkspaceId: "business";
  kaneoProjectId: string;
  state: string;
  idempotencyKey: string;
  reconciliationMarker: string;
  kaneoTaskId?: string;
  attemptCount: number;
  lastErrorCategory?: string;
  createdAt: string;
  updatedAt: string;
  lastAttemptAt: string;
};

function response(body: Record<string, unknown>, status: number) {
  return NextResponse.json({ ...body, httpStatus: status }, { status });
}

function diagnosticFailure(category: string, status = 503) {
  return response({
    success: false,
    diagnosticCategory: category,
    message: "Reservation inspection is unavailable.",
  }, status);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function timestamp(value: unknown) {
  if (!isRecord(value) || typeof value.toDate !== "function") return undefined;

  try {
    const date = value.toDate();
    return date instanceof Date && !Number.isNaN(date.valueOf())
      ? date.toISOString()
      : undefined;
  } catch {
    return undefined;
  }
}

function safeReservation(
  value: unknown,
  kaneoProjectId: string
): SafeReservation | null {
  if (!isRecord(value) || value.provider !== "kaneo" ||
    value.proveItTaskId !== DISPOSABLE_KANEO_TEST_MAPPING_ID ||
    value.proveItWorkspaceId !== BUSINESS_WORKSPACE_ID ||
    value.kaneoProjectId !== kaneoProjectId ||
    typeof value.state !== "string" || !STATES.has(value.state) ||
    value.idempotencyKey !== DISPOSABLE_KANEO_TEST_IDEMPOTENCY_KEY ||
    value.reconciliationMarker !== DISPOSABLE_KANEO_TEST_MARKER ||
    typeof value.attemptCount !== "number" || !Number.isInteger(value.attemptCount) ||
    value.attemptCount < 0) return null;

  const createdAt = timestamp(value.createdAt);
  const updatedAt = timestamp(value.updatedAt);
  const lastAttemptAt = timestamp(value.lastAttemptAt);
  if (!createdAt || !updatedAt || !lastAttemptAt) return null;

  if (value.kaneoTaskId !== undefined && typeof value.kaneoTaskId !== "string") return null;
  if (value.lastErrorCategory !== undefined &&
    (typeof value.lastErrorCategory !== "string" || !ERROR_CATEGORIES.has(value.lastErrorCategory))) return null;

  return {
    provider: "kaneo",
    proveItTaskId: DISPOSABLE_KANEO_TEST_MAPPING_ID,
    proveItWorkspaceId: "business",
    kaneoProjectId,
    state: value.state,
    idempotencyKey: DISPOSABLE_KANEO_TEST_IDEMPOTENCY_KEY,
    reconciliationMarker: DISPOSABLE_KANEO_TEST_MARKER,
    ...(typeof value.kaneoTaskId === "string" ? { kaneoTaskId: value.kaneoTaskId } : {}),
    attemptCount: value.attemptCount,
    ...(typeof value.lastErrorCategory === "string"
      ? { lastErrorCategory: value.lastErrorCategory }
      : {}),
    createdAt,
    updatedAt,
    lastAttemptAt,
  };
}

function firestoreDiagnosticCategory(error: unknown) {
  const rawCode = isRecord(error) ? error.code : undefined;
  const code = typeof rawCode === "string"
    ? rawCode.toLowerCase().replaceAll("_", "-")
    : rawCode;

  if (code === "permission-denied" || code === 7) {
    return "reservation_firestore_permission_denied";
  }
  if (code === "not-found" || code === 5) {
    return "reservation_firestore_not_found";
  }
  if (code === "failed-precondition" || code === 9) {
    return "reservation_firestore_failed_precondition";
  }
  if (code === "deadline-exceeded" || code === 4) {
    return "reservation_firestore_timeout";
  }
  if (code === "unavailable" || code === 14) {
    return "reservation_firestore_network";
  }

  return "reservation_firestore_unknown";
}

function bodDiagnosticCategory(error: unknown) {
  if (!(error instanceof AdminAuthError)) return "bod_profile_read_failed";
  if (error.status === 401 || error.status === 503) return "firebase_token_verification_failed";
  if (error.message === "Employee account is disabled.") return "inactive_user";
  if (error.message === "Administrative capability required.") return "bod_authorization_failed";
  return "bod_profile_read_failed";
}

function businessDiagnosticCategory(error: unknown) {
  if (!(error instanceof KaneoRouteAuthError)) return "business_authorization_read_failed";
  if (error.status === 401 || error.status === 503) return "firebase_token_verification_failed";
  if (error.message === "Active employee account required.") return "inactive_user";
  if (error.message === "Workspace access required.") return "business_authorization_failed";
  return "business_authorization_read_failed";
}

export async function GET(request: Request) {
  try {
    try {
      await requireBOD(request, "inspect-disposable-kaneo-test-reservation");
    } catch (error) {
      return diagnosticFailure(bodDiagnosticCategory(error), error instanceof AdminAuthError ? error.status : 503);
    }
    try {
      await requireKaneoWorkspaceAccess(request, BUSINESS_WORKSPACE_ID);
    } catch (error) {
      return diagnosticFailure(businessDiagnosticCategory(error), error instanceof KaneoRouteAuthError ? error.status : 503);
    }

    let config;
    try {
      config = getKaneoConfig();
    } catch {
      return diagnosticFailure("business_routing_failed");
    }
    let kaneoProjectId: string;
    try {
      kaneoProjectId = getKaneoProjectIdForWorkspace(
        BUSINESS_WORKSPACE_ID,
        config.projects
      );
    } catch (error) {
      if (error instanceof KaneoRoutingError) {
        return diagnosticFailure("business_routing_failed", 422);
      }
      throw error;
    }
    let snapshot;
    try {
      snapshot = await adminDb
        .collection("kaneoTaskIntegrations")
        .doc(DISPOSABLE_KANEO_TEST_MAPPING_ID)
        .get();
    } catch (error) {
      return diagnosticFailure(firestoreDiagnosticCategory(error));
    }

    if (!snapshot.exists) {
      return response({
        success: true,
        exists: false,
        message: "Disposable Kaneo test reservation does not exist.",
      }, 200);
    }

    let reservation: SafeReservation | null;
    try {
      reservation = safeReservation(snapshot.data(), kaneoProjectId);
    } catch {
      return diagnosticFailure("reservation_firestore_get_failed");
    }
    if (!reservation) {
      return diagnosticFailure("reservation_malformed", 502);
    }

    return response({
      success: true,
      exists: true,
      ...reservation,
      message: "Disposable Kaneo test reservation inspected.",
    }, 200);
  } catch {
    return diagnosticFailure("reservation_firestore_get_failed");
  }
}
