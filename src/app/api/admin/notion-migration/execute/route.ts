import "server-only";

import { NextResponse } from "next/server";

import { AdminAuthError, requireCapability } from "@/lib/admin-auth";
import { disabledMigrationExecution } from "@/lib/notion-migration-executor";

/** Intentionally disabled skeleton. A later authorization phase will add the executor. */
export async function POST(request: Request) {
  try {
    await requireCapability(request, "manageWorkspaces", "execute-notion-migration");
    return NextResponse.json(disabledMigrationExecution(), { status: 403 });
  } catch (cause) {
    if (cause instanceof AdminAuthError) return NextResponse.json({ success: false, code: "notion_migration_authorization_failed", message: cause.message }, { status: cause.status });
    return NextResponse.json({ success: false, code: "notion_migration_execution_unavailable", message: "Migration execution is unavailable." }, { status: 503 });
  }
}
