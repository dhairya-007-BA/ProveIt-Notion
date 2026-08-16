"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import Sidebar from "@/components/sidebar";
import { useAuth } from "@/components/auth-provider";
import { authenticatedRequest } from "@/lib/authenticated-request";

type VerificationResult = {
  label: string;
  httpStatus: number;
  success: boolean | null;
  healthStatus?: string;
  projectId?: string;
  projectName?: string;
  taskCount?: number;
  message?: string;
};

type DisposableCreateResult = {
  httpStatus: number;
  success: boolean | null;
  state?: string;
  kaneoTaskId?: string;
  projectId?: string;
  title?: string;
  status?: string;
  priority?: string;
  message?: string;
};

type ColumnDiagnosticResult = {
  httpStatus: number;
  success: boolean | null;
  projectId?: string;
  columns: Array<{ name: string; slug: string }>;
  toDoExists?: boolean;
  diagnosticCategory?: string;
  message?: string;
};

type ReservationResult = {
  httpStatus: number;
  success: boolean | null;
  exists?: boolean;
  provider?: string;
  proveItTaskId?: string;
  proveItWorkspaceId?: string;
  kaneoProjectId?: string;
  state?: string;
  idempotencyKey?: string;
  reconciliationMarker?: string;
  kaneoTaskId?: string;
  attemptCount?: number;
  lastErrorCategory?: string;
  createdAt?: string;
  updatedAt?: string;
  lastAttemptAt?: string;
  diagnosticCategory?: string;
  message?: string;
};

type ReservationDiagnosisResult = {
  success: boolean | null;
  originalReservationReadable?: boolean;
  originalReservationExists?: boolean;
  diagnosticWriteSucceeded?: boolean;
  diagnosticReadSucceeded?: boolean;
  diagnosticDeleteSucceeded?: boolean;
  stage?: string;
  isError?: boolean;
  typeofError?: string;
  errorName?: "Error" | "GoogleError" | "FirebaseError" | "FirestoreError" | "unknown";
  constructorName?: "Error" | "GoogleError" | "FirebaseError" | "FirestoreError" | "unknown";
  hasCode?: boolean;
  typeofCode?: "number" | "string" | "undefined" | "other";
  numericCode?: 4 | 5 | 7 | 9 | 14 | 16 | null;
  normalizedStringCode?: "deadline-exceeded" | "not-found" | "permission-denied" | "failed-precondition" | "unavailable" | "unauthenticated" | "unknown";
  message?: string;
};

type Check = {
  label: string;
  path: string;
  kind: "health" | "project" | "tasks" | "rejection";
};

const checks: Check[] = [
  { label: "Kaneo health", path: "/api/integrations/kaneo/health", kind: "health" },
  { label: "Business project", path: "/api/integrations/kaneo/projects?workspaceId=business", kind: "project" },
  { label: "Technology project", path: "/api/integrations/kaneo/projects?workspaceId=technology", kind: "project" },
  { label: "Business tasks", path: "/api/integrations/kaneo/tasks?workspaceId=business", kind: "tasks" },
  { label: "Technology tasks", path: "/api/integrations/kaneo/tasks?workspaceId=technology", kind: "tasks" },
  { label: "Company routing", path: "/api/integrations/kaneo/projects?workspaceId=company", kind: "rejection" },
  { label: "Board routing", path: "/api/integrations/kaneo/projects?workspaceId=board", kind: "rejection" },
];

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function safeString(value: unknown) {
  return typeof value === "string" ? value.slice(0, 200) : undefined;
}

function summarize(
  check: Check,
  httpStatus: number,
  body: unknown
): VerificationResult {
  const payload = record(body);
  const result: VerificationResult = {
    label: check.label,
    httpStatus,
    success: typeof payload?.success === "boolean" ? payload.success : null,
    message: safeString(payload?.message),
  };

  if (check.kind === "health") {
    result.healthStatus = safeString(payload?.status);
  }

  if (check.kind === "project") {
    const project = record(payload?.project);
    result.projectId = safeString(project?.id);
    result.projectName = safeString(project?.name);
  }

  if (check.kind === "tasks") {
    result.projectId = safeString(payload?.projectId);
    result.taskCount = Array.isArray(payload?.tasks)
      ? payload.tasks.length
      : undefined;
  }

  return result;
}

function summarizeDisposableCreate(
  httpStatus: number,
  body: unknown
): DisposableCreateResult {
  const payload = record(body);

  return {
    httpStatus,
    success: typeof payload?.success === "boolean" ? payload.success : null,
    state: safeString(payload?.state),
    kaneoTaskId: safeString(payload?.kaneoTaskId),
    projectId: safeString(payload?.projectId),
    title: safeString(payload?.title),
    status: safeString(payload?.status),
    priority: safeString(payload?.priority),
    message: safeString(payload?.message),
  };
}

function summarizeColumns(
  httpStatus: number,
  body: unknown
): ColumnDiagnosticResult {
  const payload = record(body);
  const columns = Array.isArray(payload?.columns)
    ? payload.columns.flatMap((column) => {
      const candidate = record(column);
      const name = safeString(candidate?.name);
      const slug = safeString(candidate?.slug);
      return name && slug ? [{ name, slug }] : [];
    })
    : [];

  return {
    httpStatus,
    success: typeof payload?.success === "boolean" ? payload.success : null,
    projectId: safeString(payload?.projectId),
    columns,
    toDoExists: typeof payload?.toDoExists === "boolean" ? payload.toDoExists : undefined,
    diagnosticCategory: safeString(payload?.diagnosticCategory),
    message: safeString(payload?.message),
  };
}

function summarizeReservation(
  httpStatus: number,
  body: unknown
): ReservationResult {
  const payload = record(body);

  return {
    httpStatus,
    success: typeof payload?.success === "boolean" ? payload.success : null,
    exists: typeof payload?.exists === "boolean" ? payload.exists : undefined,
    provider: safeString(payload?.provider),
    proveItTaskId: safeString(payload?.proveItTaskId),
    proveItWorkspaceId: safeString(payload?.proveItWorkspaceId),
    kaneoProjectId: safeString(payload?.kaneoProjectId),
    state: safeString(payload?.state),
    idempotencyKey: safeString(payload?.idempotencyKey),
    reconciliationMarker: safeString(payload?.reconciliationMarker),
    kaneoTaskId: safeString(payload?.kaneoTaskId),
    attemptCount: typeof payload?.attemptCount === "number" ? payload.attemptCount : undefined,
    lastErrorCategory: safeString(payload?.lastErrorCategory),
    createdAt: safeString(payload?.createdAt),
    updatedAt: safeString(payload?.updatedAt),
    lastAttemptAt: safeString(payload?.lastAttemptAt),
    diagnosticCategory: safeString(payload?.diagnosticCategory),
    message: [
      safeString(payload?.diagnosticCategory),
      safeString(payload?.message),
    ].filter((value): value is string => Boolean(value)).join(" — ") || undefined,
  };
}

function summarizeReservationDiagnosis(body: unknown): ReservationDiagnosisResult {
  const payload = record(body);
  const errorName = safeDiagnosticName(payload?.errorName);
  const constructorName = safeDiagnosticName(payload?.constructorName);
  const typeofCode = payload?.typeofCode;
  const numericCode = payload?.numericCode;
  const normalizedStringCode = payload?.normalizedStringCode;

  return {
    success: typeof payload?.success === "boolean" ? payload.success : null,
    originalReservationReadable: typeof payload?.originalReservationReadable === "boolean"
      ? payload.originalReservationReadable
      : undefined,
    originalReservationExists: typeof payload?.originalReservationExists === "boolean"
      ? payload.originalReservationExists
      : undefined,
    diagnosticWriteSucceeded: typeof payload?.diagnosticWriteSucceeded === "boolean"
      ? payload.diagnosticWriteSucceeded
      : undefined,
    diagnosticReadSucceeded: typeof payload?.diagnosticReadSucceeded === "boolean"
      ? payload.diagnosticReadSucceeded
      : undefined,
    diagnosticDeleteSucceeded: typeof payload?.diagnosticDeleteSucceeded === "boolean"
      ? payload.diagnosticDeleteSucceeded
      : undefined,
    stage: summarizeReservationDiagnosticStage(
      payload?.stage,
      typeof payload?.isError === "boolean" ? payload.isError : undefined,
      safeTypeof(payload?.typeofError),
      errorName,
      constructorName,
      typeof payload?.hasCode === "boolean" ? payload.hasCode : undefined,
      typeofCode === "number" || typeofCode === "string" ||
        typeofCode === "undefined" || typeofCode === "other"
        ? typeofCode
        : undefined,
      numericCode === 4 || numericCode === 5 || numericCode === 7 ||
        numericCode === 9 || numericCode === 14 || numericCode === 16 || numericCode === null
        ? numericCode
        : undefined,
      normalizedStringCode === "deadline-exceeded" ||
        normalizedStringCode === "not-found" || normalizedStringCode === "permission-denied" ||
        normalizedStringCode === "failed-precondition" || normalizedStringCode === "unavailable" ||
        normalizedStringCode === "unauthenticated" || normalizedStringCode === "unknown"
        ? normalizedStringCode
        : undefined
    ),
    isError: typeof payload?.isError === "boolean" ? payload.isError : undefined,
    typeofError: safeTypeof(payload?.typeofError),
    errorName,
    constructorName,
    hasCode: typeof payload?.hasCode === "boolean" ? payload.hasCode : undefined,
    typeofCode: typeofCode === "number" || typeofCode === "string" ||
      typeofCode === "undefined" || typeofCode === "other"
      ? typeofCode
      : undefined,
    numericCode: numericCode === 4 || numericCode === 5 || numericCode === 7 ||
      numericCode === 9 || numericCode === 14 || numericCode === 16 || numericCode === null
      ? numericCode
      : undefined,
    normalizedStringCode: normalizedStringCode === "deadline-exceeded" ||
      normalizedStringCode === "not-found" || normalizedStringCode === "permission-denied" ||
      normalizedStringCode === "failed-precondition" || normalizedStringCode === "unavailable" ||
      normalizedStringCode === "unauthenticated" || normalizedStringCode === "unknown"
      ? normalizedStringCode
      : undefined,
    message: safeString(payload?.message),
  };
}

function safeDiagnosticName(value: unknown): ReservationDiagnosisResult["errorName"] {
  return value === "Error" || value === "GoogleError" || value === "FirebaseError" ||
    value === "FirestoreError" || value === "unknown"
    ? value
    : undefined;
}

function safeTypeof(value: unknown) {
  return value === "object" || value === "function" || value === "string" ||
    value === "number" || value === "boolean" || value === "undefined" ||
    value === "symbol" || value === "bigint"
    ? value
    : undefined;
}

function summarizeReservationDiagnosticStage(
  stage: unknown,
  isError: boolean | undefined,
  typeofError: string | undefined,
  errorName: ReservationDiagnosisResult["errorName"],
  constructorName: ReservationDiagnosisResult["constructorName"],
  hasCode: boolean | undefined,
  typeofCode: ReservationDiagnosisResult["typeofCode"],
  numericCode: ReservationDiagnosisResult["numericCode"],
  normalizedStringCode: ReservationDiagnosisResult["normalizedStringCode"]
) {
  if (stage !== "original_read") return safeString(stage);

  return [
    stage,
    isError === undefined ? undefined : `isError: ${isError}`,
    typeofError && `typeofError: ${typeofError}`,
    errorName && `errorName: ${errorName}`,
    constructorName && `constructorName: ${constructorName}`,
    hasCode === undefined ? undefined : `hasCode: ${hasCode}`,
    typeofCode && `typeofCode: ${typeofCode}`,
    numericCode === undefined ? undefined : `numericCode: ${numericCode}`,
    normalizedStringCode && `normalizedStringCode: ${normalizedStringCode}`,
  ].filter((value): value is string => Boolean(value)).join(" · ");
}

export default function KaneoIntegrationVerificationPage() {
  const router = useRouter();
  const { firebaseUser, profile, loading } = useAuth();
  const [results, setResults] = useState<VerificationResult[]>([]);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [creationAttempted, setCreationAttempted] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createResult, setCreateResult] = useState<DisposableCreateResult | null>(null);
  const creationAttemptLock = useRef(false);
  const [checkingColumns, setCheckingColumns] = useState(false);
  const [columnResult, setColumnResult] = useState<ColumnDiagnosticResult | null>(null);
  const [inspectingReservation, setInspectingReservation] = useState(false);
  const [reservationResult, setReservationResult] = useState<ReservationResult | null>(null);
  const [diagnosingReservation, setDiagnosingReservation] = useState(false);
  const [reservationDiagnosisAttempted, setReservationDiagnosisAttempted] = useState(false);
  const [reservationDiagnosisResult, setReservationDiagnosisResult] = useState<ReservationDiagnosisResult | null>(null);
  const reservationDiagnosisLock = useRef(false);

  useEffect(() => {
    if (!loading && !firebaseUser) router.replace("/login");
  }, [firebaseUser, loading, router]);

  async function verify() {
    if (!firebaseUser || running) return;

    setRunning(true);
    setError("");
    setResults([]);

    try {
      const nextResults: VerificationResult[] = [];

      for (const check of checks) {
        const response = await authenticatedRequest(firebaseUser, check.path, {
          method: "GET",
        });
        const body = await response.json().catch(() => null);
        nextResults.push(summarize(check, response.status, body));
        setResults([...nextResults]);
      }
    } catch (requestError) {
      console.error("Kaneo verification request failed", requestError);
      setError("A verification request could not be completed.");
    } finally {
      setRunning(false);
    }
  }

  async function createOneDisposableTask() {
    if (!firebaseUser || creationAttempted || creating || creationAttemptLock.current) return;

    // This is intentionally set before the request so this page session cannot retry.
    creationAttemptLock.current = true;
    setCreationAttempted(true);
    setCreating(true);
    setCreateResult(null);

    try {
      const response = await authenticatedRequest(
        firebaseUser,
        "/api/integrations/kaneo/tasks/test",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            confirmation: "CREATE_DISPOSABLE_KANEO_TEST_TASK",
          }),
        }
      );
      const body = await response.json().catch(() => null);
      setCreateResult(summarizeDisposableCreate(response.status, body));
    } catch {
      setCreateResult({
        httpStatus: 0,
        success: false,
        message: "The disposable Kaneo task request could not be completed. It will not be retried automatically.",
      });
    } finally {
      setCreating(false);
    }
  }

  async function verifyBusinessColumns() {
    if (!firebaseUser || checkingColumns) return;

    setCheckingColumns(true);
    setColumnResult(null);

    try {
      const response = await authenticatedRequest(
        firebaseUser,
        "/api/integrations/kaneo/columns?workspaceId=business",
        { method: "GET" }
      );
      const body = await response.json().catch(() => null);
      setColumnResult(summarizeColumns(response.status, body));
    } catch {
      setColumnResult({
        httpStatus: 0,
        success: false,
        columns: [],
        message: "The Business Kaneo column check could not be completed.",
      });
    } finally {
      setCheckingColumns(false);
    }
  }

  async function inspectDisposableReservation() {
    if (!firebaseUser || inspectingReservation) return;

    setInspectingReservation(true);
    setReservationResult(null);

    try {
      const response = await authenticatedRequest(
        firebaseUser,
        "/api/integrations/kaneo/tasks/test/reservation",
        { method: "GET" }
      );
      const body = await response.json().catch(() => null);
      setReservationResult(summarizeReservation(response.status, body));
    } catch {
      setReservationResult({
        httpStatus: 0,
        success: false,
        message: "The disposable test reservation could not be inspected.",
      });
    } finally {
      setInspectingReservation(false);
    }
  }

  async function diagnoseFirestoreReservation() {
    if (!firebaseUser || diagnosingReservation || reservationDiagnosisAttempted || reservationDiagnosisLock.current) return;

    reservationDiagnosisLock.current = true;
    setReservationDiagnosisAttempted(true);
    setDiagnosingReservation(true);
    setReservationDiagnosisResult(null);

    try {
      const response = await authenticatedRequest(
        firebaseUser,
        "/api/integrations/kaneo/tasks/test/reservation/diagnose",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ confirmation: "DIAGNOSE_KANEO_RESERVATION" }),
        }
      );
      const body = await response.json().catch(() => null);
      setReservationDiagnosisResult(summarizeReservationDiagnosis(body));
    } catch {
      setReservationDiagnosisResult({
        success: false,
        message: "The Firestore reservation diagnostic could not be completed.",
      });
    } finally {
      setDiagnosingReservation(false);
    }
  }

  if (loading || (!profile && firebaseUser)) {
    return <main className="grid min-h-screen place-items-center text-sm text-[var(--muted)]">Loading verification…</main>;
  }

  if (!firebaseUser || !profile) return null;

  return <main className="flex min-h-screen bg-[var(--background)]"><Sidebar /><section className="proveit-content"><div className="proveit-content-inner max-w-3xl"><header className="proveit-page-header"><div><p className="proveit-label">Temporary verification</p><h1 className="proveit-page-title mt-1">Kaneo Integration</h1><p className="mt-2 max-w-2xl text-sm text-[var(--muted)]">Runs authenticated integration diagnostics without displaying credentials or raw upstream responses.</p></div><button onClick={verify} disabled={running} className="proveit-primary-button disabled:cursor-not-allowed disabled:opacity-60">{running ? "Verifying…" : "Verify Kaneo Integration"}</button></header>{error && <p role="alert" className="mt-5 text-sm text-[var(--danger)]">{error}</p>}<section aria-live="polite" className="mt-8 space-y-3">{results.map((result) => <article key={result.label} className="rounded-xl border border-[var(--border)] bg-white p-4 shadow-[var(--shadow-sm)]"><div className="flex flex-wrap items-baseline justify-between gap-2"><h2 className="text-sm font-semibold">{result.label}</h2><span className="text-xs text-[var(--muted)]">HTTP {result.httpStatus}</span></div><dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2"><Result label="Success" value={result.success === null ? "Unavailable" : String(result.success)} /><Result label="Health status" value={result.healthStatus} /><Result label="Project ID" value={result.projectId} /><Result label="Project name" value={result.projectName} /><Result label="Task count" value={result.taskCount?.toString()} /><Result label="Message" value={result.message} /></dl></article>)}</section><section aria-labelledby="columns-diagnostic-heading" className="mt-10 border-t border-[var(--border)] pt-8"><p className="proveit-label">READ-ONLY — does not create a task</p><h2 id="columns-diagnostic-heading" className="mt-1 text-xl font-semibold">Business Kaneo columns</h2><button onClick={verifyBusinessColumns} disabled={checkingColumns} className="proveit-primary-button mt-5 disabled:cursor-not-allowed disabled:opacity-60">{checkingColumns ? "Checking columns…" : "Verify Business Kaneo Columns"}</button><div aria-live="polite" className="mt-5">{columnResult && <article className="rounded-xl border border-[var(--border)] bg-white p-4 shadow-[var(--shadow-sm)]"><span className="text-xs text-[var(--muted)]">HTTP {columnResult.httpStatus || "Unavailable"}</span><dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2"><Result label="Success" value={columnResult.success === null ? "Unavailable" : String(columnResult.success)} /><Result label="Project ID" value={columnResult.projectId} /><Result label="to-do exists" value={columnResult.toDoExists === undefined ? undefined : String(columnResult.toDoExists)} /><Result label="Diagnostic category" value={columnResult.diagnosticCategory} /><Result label="Message" value={columnResult.message} /></dl>{columnResult.columns.length > 0 && <ul className="mt-4 space-y-1 text-sm">{columnResult.columns.map((column) => <li key={column.slug}>{column.name} <span className="text-[var(--muted)]">({column.slug})</span></li>)}</ul>}</article>}</div></section><section aria-labelledby="reservation-diagnostic-heading" className="mt-10 border-t border-[var(--border)] pt-8"><p className="proveit-label">READ-ONLY — DOES NOT CREATE A TASK</p><h2 id="reservation-diagnostic-heading" className="mt-1 text-xl font-semibold">Disposable Test Reservation</h2><button onClick={inspectDisposableReservation} disabled={inspectingReservation} className="proveit-primary-button mt-5 disabled:cursor-not-allowed disabled:opacity-60">{inspectingReservation ? "Inspecting reservation…" : "Inspect Disposable Test Reservation"}</button><div aria-live="polite" className="mt-5">{reservationResult && <article className="rounded-xl border border-[var(--border)] bg-white p-4 shadow-[var(--shadow-sm)]"><span className="text-xs text-[var(--muted)]">HTTP {reservationResult.httpStatus || "Unavailable"}</span><dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2"><Result label="Success" value={reservationResult.success === null ? "Unavailable" : String(reservationResult.success)} /><Result label="Exists" value={reservationResult.exists === undefined ? undefined : String(reservationResult.exists)} /><Result label="Provider" value={reservationResult.provider} /><Result label="ProveIt task ID" value={reservationResult.proveItTaskId} /><Result label="ProveIt workspace ID" value={reservationResult.proveItWorkspaceId} /><Result label="Kaneo project ID" value={reservationResult.kaneoProjectId} /><Result label="State" value={reservationResult.state} /><Result label="Idempotency key" value={reservationResult.idempotencyKey} /><Result label="Reconciliation marker" value={reservationResult.reconciliationMarker} /><Result label="Kaneo task ID" value={reservationResult.kaneoTaskId} /><Result label="Attempt count" value={reservationResult.attemptCount?.toString()} /><Result label="Last error category" value={reservationResult.lastErrorCategory} /><Result label="Created at" value={reservationResult.createdAt} /><Result label="Updated at" value={reservationResult.updatedAt} /><Result label="Last attempt at" value={reservationResult.lastAttemptAt} /><Result label="Message" value={reservationResult.message} /></dl></article>}</div></section><section aria-labelledby="reservation-write-diagnostic-heading" className="mt-10 border-t border-[var(--border)] pt-8"><p className="proveit-label">TEMPORARY FIRESTORE DIAGNOSTIC</p><h2 id="reservation-write-diagnostic-heading" className="mt-1 text-xl font-semibold">Firestore reservation diagnostic</h2><p className="mt-3 text-sm text-[var(--muted)]">If the original reservation is absent, this creates, reads, and deletes only the separate temporary diagnostic document.</p><button onClick={diagnoseFirestoreReservation} disabled={reservationDiagnosisAttempted || diagnosingReservation} className="proveit-primary-button mt-5 disabled:cursor-not-allowed disabled:opacity-60">{diagnosingReservation ? "Diagnosing…" : reservationDiagnosisAttempted ? "Firestore Reservation Diagnostic Used" : "Diagnose Firestore Reservation"}</button><div aria-live="polite" className="mt-5">{reservationDiagnosisResult && <article className="rounded-xl border border-[var(--border)] bg-white p-4 shadow-[var(--shadow-sm)]"><dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2"><Result label="Success" value={reservationDiagnosisResult.success === null ? "Unavailable" : String(reservationDiagnosisResult.success)} /><Result label="Original reservation readable" value={reservationDiagnosisResult.originalReservationReadable === undefined ? undefined : String(reservationDiagnosisResult.originalReservationReadable)} /><Result label="Original reservation exists" value={reservationDiagnosisResult.originalReservationExists === undefined ? undefined : String(reservationDiagnosisResult.originalReservationExists)} /><Result label="Diagnostic write succeeded" value={reservationDiagnosisResult.diagnosticWriteSucceeded === undefined ? undefined : String(reservationDiagnosisResult.diagnosticWriteSucceeded)} /><Result label="Diagnostic read succeeded" value={reservationDiagnosisResult.diagnosticReadSucceeded === undefined ? undefined : String(reservationDiagnosisResult.diagnosticReadSucceeded)} /><Result label="Diagnostic delete succeeded" value={reservationDiagnosisResult.diagnosticDeleteSucceeded === undefined ? undefined : String(reservationDiagnosisResult.diagnosticDeleteSucceeded)} /><Result label="Stage" value={reservationDiagnosisResult.stage} /><Result label="Message" value={reservationDiagnosisResult.message} /></dl></article>}</div></section><section aria-labelledby="phase-2c-heading" className="mt-10 border-t border-[var(--border)] pt-8"><p className="proveit-label">Phase 2C · controlled live test</p><h2 id="phase-2c-heading" className="mt-1 text-xl font-semibold">Create a disposable Kaneo test task</h2><p className="mt-3 text-sm font-medium text-[var(--danger)]">This performs one real Kaneo task creation attempt.</p><button onClick={createOneDisposableTask} disabled={creationAttempted || creating} className="proveit-primary-button mt-5 disabled:cursor-not-allowed disabled:opacity-60">{creating ? "Creating…" : creationAttempted ? "Disposable Test Attempt Used" : "Create ONE Disposable Kaneo Test Task"}</button><div aria-live="polite" className="mt-5">{createResult && <article className="rounded-xl border border-[var(--border)] bg-white p-4 shadow-[var(--shadow-sm)]"><span className="text-xs text-[var(--muted)]">HTTP {createResult.httpStatus || "Unavailable"}</span><dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2"><Result label="Success" value={createResult.success === null ? "Unavailable" : String(createResult.success)} /><Result label="State" value={createResult.state} /><Result label="Kaneo task ID" value={createResult.kaneoTaskId} /><Result label="Project ID" value={createResult.projectId} /><Result label="Title" value={createResult.title} /><Result label="Status" value={createResult.status} /><Result label="Priority" value={createResult.priority} /><Result label="Message" value={createResult.message} /></dl></article>}</div></section></div></section></main>;
}

function Result({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return <div><dt className="text-xs font-medium uppercase tracking-wide text-[var(--subtle)]">{label}</dt><dd className="mt-0.5 break-words text-[var(--foreground)]">{value}</dd></div>;
}
