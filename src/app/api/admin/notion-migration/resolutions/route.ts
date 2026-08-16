import "server-only";

import { createHash } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { NextResponse } from "next/server";

import { AdminAuthError, requireCapability } from "@/lib/admin-auth";
import { adminDb } from "@/lib/firebase-admin";
import { validateMigrationResolution } from "@/lib/notion-migration-resolutions";

const fingerprint = (value: string | null) => Boolean(value && /^[a-f0-9]{64}$/i.test(value));
const collectionFor = (type: string) => `${type}Resolutions`;

function error(message: string, status: number, code: string) { return NextResponse.json({ success: false, code, message }, { status }); }

export async function GET(request: Request) {
  try {
    await requireCapability(request, "manageWorkspaces", "read-notion-migration-resolutions");
    const sourceFingerprint = new URL(request.url).searchParams.get("sourceFingerprint");
    if (!fingerprint(sourceFingerprint)) return error("A valid source fingerprint is required.", 422, "invalid_source_fingerprint");
    const root = adminDb.collection("notionMigrationConfigs").doc(sourceFingerprint!);
    const types = ["workspace", "person", "duplicate", "status", "property", "schema", "document"] as const;
    const snapshots = await Promise.all(types.map((type) => root.collection(collectionFor(type)).get()));
    const resolutions = snapshots.flatMap((snapshot, index) => snapshot.docs.map((document) => {
      const data = document.data(); return { type: types[index], key: typeof data.key === "string" ? data.key : document.id, value: typeof data.value === "object" && data.value !== null ? data.value : {} };
    }));
    return NextResponse.json({ success: true, sourceFingerprint, resolutions });
  } catch (cause) {
    if (cause instanceof AdminAuthError) return error(cause.message, cause.status, "notion_migration_authorization_failed");
    return error("Migration resolutions could not be loaded.", 503, "notion_migration_resolution_load_failed");
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireCapability(request, "manageWorkspaces", "save-notion-migration-resolution");
    const body = await request.json().catch(() => null) as { sourceFingerprint?: unknown; resolution?: unknown } | null;
    if (!body || typeof body.sourceFingerprint !== "string" || !fingerprint(body.sourceFingerprint)) return error("A valid source fingerprint is required.", 422, "invalid_source_fingerprint");
    const resolution = validateMigrationResolution(body.resolution);
    if (!resolution) return error("Invalid migration resolution.", 422, "invalid_migration_resolution");
    if (resolution.type === "property" && resolution.value.choice === "skip" && resolution.value.confirmSkip !== true) return error("Skipping a source property requires confirmation.", 422, "skip_confirmation_required");
    if (resolution.type === "person" && typeof resolution.value.employeeId === "string") {
      const employee = await adminDb.collection("users").where("employeeId", "==", resolution.value.employeeId).limit(2).get();
      if (employee.size !== 1 || employee.docs[0].data().active !== true) return error("Select an active existing employee.", 422, "invalid_employee_resolution");
    }
    const root = adminDb.collection("notionMigrationConfigs").doc(body.sourceFingerprint);
    const decisionId = createHash("sha256").update(`${resolution.type}:${resolution.key}`).digest("hex");
    await root.set({ sourceFingerprint: body.sourceFingerprint, updatedAt: FieldValue.serverTimestamp(), updatedBy: user.uid }, { merge: true });
    await root.collection(collectionFor(resolution.type)).doc(decisionId).set({ key: resolution.key, value: resolution.value, updatedAt: FieldValue.serverTimestamp(), updatedBy: user.uid }, { merge: true });
    return NextResponse.json({ success: true, resolution });
  } catch (cause) {
    if (cause instanceof AdminAuthError) return error(cause.message, cause.status, "notion_migration_authorization_failed");
    return error("Migration resolution could not be saved.", 503, "notion_migration_resolution_save_failed");
  }
}
