import "server-only";

import { NextResponse } from "next/server";

import { requireCapability, AdminAuthError } from "@/lib/admin-auth";
import { adminDb } from "@/lib/firebase-admin";
import { NOTION_IMPORT_LIMITS } from "@/lib/notion-import";
import { createNotionMigrationPreview } from "@/lib/notion-migration-preview";

const MAX_REQUEST_ARCHIVE_BYTES = 64 * 1024 * 1024;

function safeError(message: string, status: number, code: string) {
  return NextResponse.json({ success: false, code, message }, { status });
}

export async function POST(request: Request) {
  try {
    await requireCapability(request, "manageWorkspaces", "preview-notion-migration");
    const form = await request.formData();
    const files = form.getAll("archives").filter((value): value is File => value instanceof File);
    if (!files.length || files.length > NOTION_IMPORT_LIMITS.maxOuterArchives || form.getAll("archives").length !== files.length) {
      return safeError("Provide one or more Notion export ZIP archives.", 422, "invalid_archives");
    }
    if (files.some((file) => !file.name.toLowerCase().endsWith(".zip") || file.size <= 0 || file.size > MAX_REQUEST_ARCHIVE_BYTES)) {
      return safeError("Each archive must be a supported ZIP within the preview size limit.", 422, "invalid_archive_file");
    }
    const employees = (await adminDb.collection("users").where("active", "==", true).get()).docs.map((document) => {
      const value = document.data();
      return {
        employeeId: typeof value.employeeId === "string" ? value.employeeId : "",
        name: typeof value.name === "string" ? value.name : undefined,
        email: typeof value.email === "string" ? value.email : undefined,
      };
    }).filter((employee) => Boolean(employee.employeeId));
    const archives = await Promise.all(files.map(async (file) => ({ name: file.name, bytes: Buffer.from(await file.arrayBuffer()) })));
    const manifest = await createNotionMigrationPreview(archives, employees);
    return NextResponse.json({ success: true, manifest, employees });
  } catch (error) {
    if (error instanceof AdminAuthError) return safeError(error.message, error.status, "notion_migration_authorization_failed");
    return safeError("Notion migration preview could not be prepared.", 503, "notion_migration_preview_unavailable");
  }
}
