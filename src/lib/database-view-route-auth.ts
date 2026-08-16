import "server-only";

import { adminDb } from "@/lib/firebase-admin";
import {
  CustomFieldAuthError,
  requireCustomFieldWorkspaceUser,
} from "@/lib/custom-field-route-auth";

export class DatabaseViewRouteError extends Error {
  constructor(public code: "database_views_access_check_failed" | "database_views_database_lookup_failed" | "database_views_query_failed") {
    super(code);
    this.name = "DatabaseViewRouteError";
  }
}

/**
 * Saved views are presentation state, but their database/workspace pair must
 * still be established server-side rather than accepted from the browser.
 */
export async function requireDatabaseViewAccess(
  request: Request,
  workspaceId: string,
  databaseId: string
) {
  const actor = await (async () => {
    try {
      return await requireCustomFieldWorkspaceUser(request, workspaceId);
    } catch (error) {
      if (error instanceof CustomFieldAuthError) throw error;
      throw new DatabaseViewRouteError("database_views_access_check_failed");
    }
  })();

  const database = await (async () => {
    try {
      return await adminDb.collection("databases").doc(databaseId).get();
    } catch {
      throw new DatabaseViewRouteError("database_views_database_lookup_failed");
    }
  })();

  if (!database.exists || database.data()?.workspaceId !== workspaceId) {
    throw new CustomFieldAuthError("Database not found.", 404);
  }

  return { actor, database };
}
