import "server-only";

import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";

import { AdminAuthError, requireBOD } from "@/lib/admin-auth";
import { adminDb } from "@/lib/firebase-admin";
import {
  KaneoRouteAuthError,
  requireKaneoWorkspaceAccess,
} from "@/lib/kaneo-route-auth";
import { DISPOSABLE_KANEO_TEST_MAPPING_ID } from "@/lib/kaneo-integrations";

const CONFIRMATION = "DIAGNOSE_KANEO_RESERVATION";
const BUSINESS_WORKSPACE_ID = "business";
const DIAGNOSTIC_MAPPING_ID = "__proveit_kaneo_reservation_diagnostic_v1__";

type DiagnosticStage =
  | "original_read"
  | "diagnostic_write"
  | "diagnostic_read"
  | "diagnostic_delete";

type SafeErrorName =
  | "Error"
  | "GoogleError"
  | "FirebaseError"
  | "FirestoreError"
  | "unknown";

type SafeCodeType = "number" | "string" | "undefined" | "other";

type OriginalReadStructure = {
  isError: boolean;
  typeofError: string;
  errorName: SafeErrorName;
  constructorName: SafeErrorName;
  hasCode: boolean;
  typeofCode: SafeCodeType;
  numericCode: 4 | 5 | 7 | 9 | 14 | 16 | null;
  normalizedStringCode:
    | "deadline-exceeded"
    | "not-found"
    | "permission-denied"
    | "failed-precondition"
    | "unavailable"
    | "unauthenticated"
    | "unknown";
};

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

function response(body: Record<string, unknown>, status: number) {
  return NextResponse.json(body, { status });
}

function failure(stage: DiagnosticStage) {
  return response({
    success: false,
    originalReservationReadable: false,
    originalReservationExists: false,
    diagnosticWriteSucceeded: false,
    diagnosticReadSucceeded: false,
    diagnosticDeleteSucceeded: false,
    stage,
    message: "Reservation diagnostic could not complete.",
  }, 503);
}

function safeErrorName(value: unknown): SafeErrorName {
  return value === "Error" || value === "GoogleError" ||
    value === "FirebaseError" || value === "FirestoreError"
    ? value
    : "unknown";
}

function originalReadStructure(error: unknown): OriginalReadStructure {
  const isError = error instanceof Error;
  const objectError = typeof error === "object" && error !== null
    ? error as { code?: unknown }
    : null;
  const code = objectError?.code;
  const codeType = typeof code;
  const typeofCode: SafeCodeType = codeType === "number" || codeType === "string" ||
    codeType === "undefined"
    ? codeType
    : "other";
  const normalizedCode = typeof code === "string"
    ? code.toLowerCase().replaceAll("_", "-")
    : "";

  return {
    isError,
    typeofError: typeof error,
    errorName: isError ? safeErrorName(error.name) : "unknown",
    constructorName: isError ? safeErrorName(error.constructor.name) : "unknown",
    hasCode: typeofCode !== "undefined",
    typeofCode,
    numericCode: code === 4 || code === 5 || code === 7 || code === 9 || code === 14 || code === 16
      ? code
      : null,
    normalizedStringCode: normalizedCode === "deadline-exceeded" ||
      normalizedCode === "not-found" || normalizedCode === "permission-denied" ||
      normalizedCode === "failed-precondition" || normalizedCode === "unavailable" ||
      normalizedCode === "unauthenticated"
      ? normalizedCode
      : "unknown",
  };
}

function originalReadFailure(error: unknown) {
  return response({
    success: false,
    originalReservationReadable: false,
    originalReservationExists: false,
    diagnosticWriteSucceeded: false,
    diagnosticReadSucceeded: false,
    diagnosticDeleteSucceeded: false,
    stage: "original_read",
    ...originalReadStructure(error),
    message: "Reservation diagnostic could not complete.",
  }, 503);
}

export async function POST(request: Request) {
  if (!await hasValidConfirmation(request)) {
    return response({ success: false, message: "A valid reservation diagnostic confirmation is required." }, 422);
  }

  try {
    await requireBOD(request, "diagnose-disposable-kaneo-reservation");
    await requireKaneoWorkspaceAccess(request, BUSINESS_WORKSPACE_ID);
  } catch (error) {
    const status = error instanceof AdminAuthError || error instanceof KaneoRouteAuthError
      ? error.status
      : 503;
    return response({ success: false, message: "Reservation diagnostic authorization is unavailable." }, status);
  }

  const integrations = adminDb.collection("kaneoTaskIntegrations");
  const originalReservation = integrations.doc(DISPOSABLE_KANEO_TEST_MAPPING_ID);
  let originalSnapshot;
  try {
    originalSnapshot = await originalReservation.get();
  } catch (error) {
    return originalReadFailure(error);
  }

  if (originalSnapshot.exists) {
    return response({
      success: true,
      originalReservationReadable: true,
      originalReservationExists: true,
      diagnosticWriteSucceeded: false,
      diagnosticReadSucceeded: false,
      diagnosticDeleteSucceeded: false,
      message: "Original reservation exists; diagnostic document operations were skipped.",
    }, 200);
  }

  const diagnosticReservation = integrations.doc(DIAGNOSTIC_MAPPING_ID);
  try {
    await diagnosticReservation.create({
      provider: "kaneo",
      diagnostic: true,
      createdAt: FieldValue.serverTimestamp(),
    });
  } catch {
    return failure("diagnostic_write");
  }

  try {
    await diagnosticReservation.get();
  } catch {
    return failure("diagnostic_read");
  }

  try {
    await diagnosticReservation.delete();
  } catch {
    return failure("diagnostic_delete");
  }

  return response({
    success: true,
    originalReservationReadable: true,
    originalReservationExists: false,
    diagnosticWriteSucceeded: true,
    diagnosticReadSucceeded: true,
    diagnosticDeleteSucceeded: true,
    message: "Reservation diagnostic completed.",
  }, 200);
}
