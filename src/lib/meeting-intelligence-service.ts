import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";

import { CustomFieldAuthError, requireCustomFieldWorkspaceUser } from "@/lib/custom-field-route-auth";
import { adminDb } from "@/lib/firebase-admin";
import type {
  MeetingIntelligenceError,
  MeetingIntelligenceOutput,
  MeetingIntelligenceProcess,
  MeetingIntelligenceRecord,
} from "@/types/meeting";

type IntelligenceOperation = "transcription" | "analysis";
type MeetingForIntelligence = { id: string; workspaceId: string; transcript: string };

const PROCESSING_LEASE_MS = 6 * 60 * 1000;

export class MeetingIntelligenceConflictError extends Error {
  status = 409 as const;
  constructor(message = "Meeting intelligence is already processing.") {
    super(message);
    this.name = "MeetingIntelligenceConflictError";
  }
}

function dateString(value: unknown): string | null {
  if (value instanceof Date) return value.toISOString();
  if (value && typeof value === "object" && "toDate" in value && typeof value.toDate === "function") {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }
  return typeof value === "string" ? value : null;
}

function processState(value: unknown): MeetingIntelligenceProcess {
  const state = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const status = ["not_started", "processing", "completed", "failed"].includes(String(state.status))
    ? state.status as MeetingIntelligenceProcess["status"]
    : "not_started";
  const error = state.error && typeof state.error === "object" ? state.error as MeetingIntelligenceError : null;
  return {
    status,
    attempt: typeof state.attempt === "number" && Number.isFinite(state.attempt) ? state.attempt : 0,
    startedAt: dateString(state.startedAt),
    completedAt: dateString(state.completedAt),
    failedAt: dateString(state.failedAt),
    error,
  };
}

export function emptyMeetingIntelligence(meetingId: string, workspaceId: string): MeetingIntelligenceRecord {
  const idle: MeetingIntelligenceProcess = { status: "not_started", attempt: 0, startedAt: null, completedAt: null, failedAt: null, error: null };
  return {
    meetingId,
    workspaceId,
    rawTranscript: "",
    rawTranscriptSource: null,
    transcription: { ...idle },
    analysis: { ...idle, inputSource: null, inputFingerprint: null, output: null },
    createdAt: null,
    updatedAt: null,
  };
}

export function meetingIntelligenceFromFirestore(meetingId: string, workspaceId: string, value?: Record<string, unknown>): MeetingIntelligenceRecord {
  if (!value) return emptyMeetingIntelligence(meetingId, workspaceId);
  const analysis = value.analysis && typeof value.analysis === "object" ? value.analysis as Record<string, unknown> : {};
  return {
    meetingId,
    workspaceId,
    rawTranscript: typeof value.rawTranscript === "string" ? value.rawTranscript : "",
    rawTranscriptSource: value.rawTranscriptSource === "whisper" ? "whisper" : null,
    transcription: processState(value.transcription),
    analysis: {
      ...processState(analysis),
      inputSource: analysis.inputSource === "raw_transcript" || analysis.inputSource === "meeting_transcript" ? analysis.inputSource : null,
      inputFingerprint: typeof analysis.inputFingerprint === "string" ? analysis.inputFingerprint : null,
      output: analysis.output && typeof analysis.output === "object" ? analysis.output as MeetingIntelligenceOutput : null,
    },
    createdAt: dateString(value.createdAt),
    updatedAt: dateString(value.updatedAt),
  };
}

export async function authorizeMeetingIntelligence(request: Request, workspaceId: string, meetingId: string): Promise<MeetingForIntelligence> {
  await requireCustomFieldWorkspaceUser(request, workspaceId);
  let snapshot;
  try { snapshot = await adminDb.collection("meetings").doc(meetingId).get(); }
  catch { throw new CustomFieldAuthError("Meeting access is temporarily unavailable.", 503, "custom_fields_access_check_failed"); }
  const value = snapshot.data();
  if (!snapshot.exists || value?.workspaceId !== workspaceId) throw new CustomFieldAuthError("Meeting not found.", 404, "custom_fields_workspace_not_found");
  return { id: meetingId, workspaceId, transcript: typeof value.transcript === "string" ? value.transcript : "" };
}

export async function getMeetingIntelligence(meetingId: string, workspaceId: string) {
  const snapshot = await adminDb.collection("meetingIntelligence").doc(meetingId).get();
  const value = snapshot.data();
  if (snapshot.exists && value?.workspaceId !== workspaceId) throw new CustomFieldAuthError("Meeting not found.", 404, "custom_fields_workspace_not_found");
  return meetingIntelligenceFromFirestore(meetingId, workspaceId, value);
}

function hasLiveLease(value: unknown) {
  const process = processState(value);
  if (process.status !== "processing" || !process.startedAt) return false;
  return Date.now() - new Date(process.startedAt).getTime() < PROCESSING_LEASE_MS;
}

export async function beginMeetingIntelligence(meetingId: string, workspaceId: string, operation: IntelligenceOperation) {
  const ref = adminDb.collection("meetingIntelligence").doc(meetingId);
  const runId = randomUUID();
  await adminDb.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const value = snapshot.data() ?? {};
    if (snapshot.exists && value.workspaceId !== workspaceId) throw new CustomFieldAuthError("Meeting not found.", 404, "custom_fields_workspace_not_found");
    if (hasLiveLease(value[operation])) throw new MeetingIntelligenceConflictError();
    const previous = processState(value[operation]);
    const next = {
      ...value,
      meetingId,
      workspaceId,
      [operation]: {
        ...((value[operation] && typeof value[operation] === "object") ? value[operation] as Record<string, unknown> : {}),
        status: "processing",
        runId,
        attempt: previous.attempt + 1,
        startedAt: FieldValue.serverTimestamp(),
        completedAt: null,
        failedAt: null,
        error: null,
        ...(operation === "analysis" ? { output: null } : {}),
      },
      createdAt: value.createdAt ?? FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };
    transaction.set(ref, next);
  });
  return runId;
}

async function updateCurrentRun(meetingId: string, operation: IntelligenceOperation, runId: string, update: Record<string, unknown>) {
  const ref = adminDb.collection("meetingIntelligence").doc(meetingId);
  return adminDb.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const value = snapshot.data();
    const process = value?.[operation];
    if (!process || typeof process !== "object" || (process as Record<string, unknown>).runId !== runId || (process as Record<string, unknown>).status !== "processing") return false;
    transaction.update(ref, update);
    return true;
  });
}

export async function completeTranscription(meetingId: string, runId: string, rawTranscript: string) {
  const ref = adminDb.collection("meetingIntelligence").doc(meetingId);
  return adminDb.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const value = snapshot.data();
    const process = value?.transcription;
    if (!process || typeof process !== "object" || (process as Record<string, unknown>).runId !== runId || (process as Record<string, unknown>).status !== "processing") return false;
    if (typeof value?.rawTranscript === "string" && value.rawTranscript.trim()) {
      throw new MeetingIntelligenceConflictError("The preserved raw transcript cannot be replaced.");
    }
    transaction.update(ref, {
      rawTranscript,
      rawTranscriptSource: "whisper",
      "transcription.status": "completed",
      "transcription.completedAt": FieldValue.serverTimestamp(),
      "transcription.failedAt": null,
      "transcription.error": null,
      updatedAt: FieldValue.serverTimestamp(),
    });
    return true;
  });
}

export function transcriptFingerprint(transcript: string) {
  return createHash("sha256").update(transcript).digest("hex");
}

export async function completeAnalysis(meetingId: string, runId: string, inputSource: "raw_transcript" | "meeting_transcript", transcript: string, output: MeetingIntelligenceOutput) {
  return updateCurrentRun(meetingId, "analysis", runId, {
    "analysis.status": "completed",
    "analysis.inputSource": inputSource,
    "analysis.inputFingerprint": transcriptFingerprint(transcript),
    "analysis.output": output,
    "analysis.completedAt": FieldValue.serverTimestamp(),
    "analysis.failedAt": null,
    "analysis.error": null,
    updatedAt: FieldValue.serverTimestamp(),
  });
}

export async function failMeetingIntelligence(meetingId: string, operation: IntelligenceOperation, runId: string, error: MeetingIntelligenceError) {
  return updateCurrentRun(meetingId, operation, runId, {
    [`${operation}.status`]: "failed",
    [`${operation}.failedAt`]: FieldValue.serverTimestamp(),
    [`${operation}.error`]: error,
    updatedAt: FieldValue.serverTimestamp(),
  });
}
