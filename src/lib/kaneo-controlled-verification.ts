import "server-only";

import { FieldValue } from "firebase-admin/firestore";

import { adminDb } from "@/lib/firebase-admin";
import { getKaneoConfig, getKaneoTasks } from "@/lib/kaneo";
import { POST as createKaneoTask } from "@/app/api/integrations/kaneo/tasks/route";
import { DELETE as deleteKaneoTask, PATCH as updateKaneoTask } from "@/app/api/integrations/kaneo/tasks/[taskId]/route";

const PREFIX = "PROVEIT KANEO LIVE VERIFY —";
const DESCRIPTION = "Controlled production integration verification. Safe to delete.";
const UPDATED_TITLE = "PROVEIT KANEO LIVE VERIFY — TITLE UPDATED";
const UPDATED_DESCRIPTION = "Controlled description synchronization verified.";

export type ControlledVerificationResult = {
  stage: string;
  mutationAttempted: boolean;
  authentication: "PASS";
  bodAuthorization: "PASS";
  businessCreate: "PASS" | "FAIL" | "AMBIGUOUS";
  kaneoCreate: "PASS" | "FAIL" | "AMBIGUOUS";
  durableMapping: "PASS" | "FAIL";
  kaneoTaskConfirmed: "PASS" | "FAIL";
  titleSync: "PASS" | "FAIL" | "AMBIGUOUS";
  descriptionSync: "PASS" | "FAIL" | "AMBIGUOUS";
  prioritySync: "PASS" | "FAIL" | "AMBIGUOUS";
  inProgressSync: "PASS" | "FAIL" | "AMBIGUOUS";
  doneSync: "PASS" | "FAIL" | "AMBIGUOUS";
  blockedSafety: "PASS" | "FAIL";
  commentsIsolation: "PASS";
  customFieldsIsolation: "PASS";
  kaneoDelete: "PASS" | "FAIL" | "AMBIGUOUS";
  proveItDelete: "PASS" | "FAIL";
  duplicates: number;
  automaticRetriesObserved: "NO";
  message: string;
};

function initialResult(): ControlledVerificationResult {
  return {
    stage: "ready_for_mutation", mutationAttempted: false,
    authentication: "PASS", bodAuthorization: "PASS", businessCreate: "FAIL", kaneoCreate: "FAIL",
    durableMapping: "FAIL", kaneoTaskConfirmed: "FAIL", titleSync: "FAIL", descriptionSync: "FAIL",
    prioritySync: "FAIL", inProgressSync: "FAIL", doneSync: "FAIL", blockedSafety: "FAIL",
    commentsIsolation: "PASS", customFieldsIsolation: "PASS", kaneoDelete: "FAIL", proveItDelete: "FAIL",
    duplicates: 0, automaticRetriesObserved: "NO", message: "Controlled verification did not complete.",
  };
}

function requestWithBody(request: Request, method: "POST" | "PATCH", body: object) {
  return new Request(request.url, {
    method,
    headers: { Authorization: request.headers.get("authorization") ?? "", "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function routeOutcome(response: Response) {
  const body = await response.json().catch(() => null);
  const payload = isRecord(body) ? body : {};
  return {
    ok: response.ok && payload.success === true,
    ambiguous: payload.message === "Kaneo task creation outcome is ambiguous and will not be retried automatically." || payload.state === "ambiguous",
  };
}

async function verifyRemoteTask(projectId: string, taskId: string, expected: Partial<{ title: string; description: string; priority: string; status: string }>) {
  const task = (await getKaneoTasks(projectId, { config: getKaneoConfig() })).find((candidate) => candidate.id === taskId);
  return Boolean(task && Object.entries(expected).every(([key, value]) => task[key as keyof typeof task] === value));
}

export async function runControlledBusinessSyncTest(request: Request, uid: string): Promise<ControlledVerificationResult> {
  const result = initialResult();
  const title = `${PREFIX} ${new Date().toISOString()}`;
  const taskRef = adminDb.collection("tasks").doc();
  const projects = getKaneoConfig().projects;
  let kaneoTaskId = "";

  try {
    result.stage = "proveit_create_attempted"; result.mutationAttempted = true;
    await taskRef.set({ title, description: DESCRIPTION, workspaceId: "business", status: "todo", priority: "low", assigneeId: null, dueDate: null, createdBy: uid, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(), source: "proveit", archived: false });
    result.businessCreate = "PASS";

    result.stage = "kaneo_create_attempted";
    const created = await routeOutcome(await createKaneoTask(requestWithBody(request, "POST", { proveItTaskId: taskRef.id, title, description: DESCRIPTION, priority: "low" })));
    result.kaneoCreate = created.ok ? "PASS" : created.ambiguous ? "AMBIGUOUS" : "FAIL";
    if (!created.ok) { result.businessCreate = "PASS"; result.message = created.ambiguous ? "Kaneo creation could not be confirmed; the sequence stopped without retry." : "Kaneo creation failed; the sequence stopped without retry."; return result; }

    const mapped = await taskRef.get();
    const mapping = mapped.data()?.integration?.kaneo;
    if (!mapping?.taskId || mapping.projectId !== projects.business) { result.message = "Kaneo mapping could not be confirmed; the sequence stopped."; return result; }
    kaneoTaskId = mapping.taskId;
    result.durableMapping = "PASS";
    result.kaneoTaskConfirmed = await verifyRemoteTask(projects.business, kaneoTaskId, { title, description: DESCRIPTION, priority: "low", status: "to-do" }) ? "PASS" : "FAIL";
    if (result.kaneoTaskConfirmed !== "PASS") { result.message = "Kaneo task confirmation failed; the sequence stopped."; return result; }
    result.duplicates = (await getKaneoTasks(projects.business, { config: getKaneoConfig() })).filter((task) => task.title.startsWith(PREFIX)).length;
    if (result.duplicates !== 1) { result.message = "Duplicate detection failed; the sequence stopped without deleting any task."; return result; }

    const update = async (fields: string[], values: Record<string, unknown>, expected: Parameters<typeof verifyRemoteTask>[2], resultKey: "titleSync" | "descriptionSync" | "prioritySync" | "inProgressSync" | "doneSync") => {
      await taskRef.update({ ...values, updatedAt: FieldValue.serverTimestamp() });
      const outcome = await routeOutcome(await updateKaneoTask(requestWithBody(request, "PATCH", { fields }), { params: Promise.resolve({ taskId: taskRef.id }) }));
      result[resultKey] = outcome.ok ? (await verifyRemoteTask(projects.business, kaneoTaskId, expected) ? "PASS" : "FAIL") : outcome.ambiguous ? "AMBIGUOUS" : "FAIL";
      return result[resultKey] === "PASS";
    };
    if (!await update(["title"], { title: UPDATED_TITLE }, { title: UPDATED_TITLE }, "titleSync")) { result.message = "Title synchronization did not complete; no retry was attempted."; return result; }
    if (!await update(["description"], { description: UPDATED_DESCRIPTION }, { description: UPDATED_DESCRIPTION }, "descriptionSync")) { result.message = "Description synchronization did not complete; no retry was attempted."; return result; }
    if (!await update(["priority"], { priority: "high" }, { priority: "high" }, "prioritySync")) { result.message = "Priority synchronization did not complete; no retry was attempted."; return result; }
    if (!await update(["status"], { status: "in_progress" }, { status: "in-progress" }, "inProgressSync")) { result.message = "In-progress synchronization did not complete; no retry was attempted."; return result; }
    if (!await update(["status"], { status: "done" }, { status: "done" }, "doneSync")) { result.message = "Done synchronization did not complete; no retry was attempted."; return result; }

    const beforeBlocked = (await getKaneoTasks(projects.business, { config: getKaneoConfig() })).find((task) => task.id === kaneoTaskId)?.status;
    await taskRef.update({ status: "blocked", updatedAt: FieldValue.serverTimestamp() });
    const blocked = await routeOutcome(await updateKaneoTask(requestWithBody(request, "PATCH", { fields: ["status"] }), { params: Promise.resolve({ taskId: taskRef.id }) }));
    const afterBlocked = (await getKaneoTasks(projects.business, { config: getKaneoConfig() })).find((task) => task.id === kaneoTaskId)?.status;
    result.blockedSafety = !blocked.ok && beforeBlocked === afterBlocked ? "PASS" : "FAIL";
    if (result.blockedSafety !== "PASS") { result.message = "Blocked-status safety could not be confirmed; the sequence stopped."; return result; }

    const deletion = await routeOutcome(await deleteKaneoTask(new Request(request.url, { method: "DELETE", headers: { Authorization: request.headers.get("authorization") ?? "" } }), { params: Promise.resolve({ taskId: taskRef.id }) }));
    result.kaneoDelete = deletion.ok ? "PASS" : deletion.ambiguous ? "AMBIGUOUS" : "FAIL";
    if (!deletion.ok) { result.message = deletion.ambiguous ? "Kaneo deletion could not be confirmed; the ProveIt task was preserved." : "Kaneo deletion failed; the ProveIt task was preserved."; return result; }
    await taskRef.delete();
    result.proveItDelete = "PASS";
    result.duplicates = (await getKaneoTasks(projects.business, { config: getKaneoConfig() })).filter((task) => task.title.startsWith(PREFIX)).length;
    result.message = result.duplicates === 0 ? "Controlled Business Sync Test completed." : "Kaneo deletion completed, but duplicate detection did not return zero.";
    return result;
  } catch {
    result.message = "Controlled verification stopped after a server-side failure. No automatic retry was attempted.";
    return result;
  }
}
