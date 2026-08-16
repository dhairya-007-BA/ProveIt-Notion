import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";
import { CustomFieldAuthError } from "@/lib/custom-field-route-auth";
import { DatabaseViewRouteError, requireDatabaseViewAccess } from "@/lib/database-view-route-auth";
import { validateDatabaseViewName, validateDatabaseViewState } from "@/lib/database-views";

type Context = { params: Promise<{ workspaceId: string; databaseId: string }> };

function failure(error: unknown) {
  if (error instanceof CustomFieldAuthError) {
    const code = error.status === 401
      ? "database_views_authentication_failed"
      : error.code === "custom_fields_server_authentication_unavailable"
        ? "database_views_server_authentication_unavailable"
      : error.status === 503
          ? "database_views_access_check_failed"
        : "database_views_authorization_failed";
    return NextResponse.json({ success: false, code, message: error.message }, { status: error.status });
  }
  if (error instanceof DatabaseViewRouteError) return NextResponse.json({ success: false, code: error.code, message: "Saved views could not be loaded." }, { status: 503 });
  return NextResponse.json({ success: false, code: "database_views_unknown_failure", message: "Saved views could not be processed." }, { status: 500 });
}

function properties(data: Record<string, unknown> | undefined) {
  return Array.isArray(data?.properties)
    ? data.properties.filter((property): property is { id: string; type: string } => typeof property === "object" && property !== null && typeof (property as { id?: unknown }).id === "string" && typeof (property as { type?: unknown }).type === "string")
    : [];
}

function viewResponse(snapshot: { id: string; data(): Record<string, unknown> }) {
  const data = snapshot.data();
  return { id: snapshot.id, name: data.name, databaseId: data.databaseId, workspaceId: data.workspaceId, type: data.type, filters: data.filters ?? [], sort: data.sort ?? null, visiblePropertyIds: data.visiblePropertyIds ?? [], propertyOrder: data.propertyOrder ?? [] };
}

export async function GET(request: Request, context: Context) {
  try {
    const { workspaceId, databaseId } = await context.params;
    await requireDatabaseViewAccess(request, workspaceId, databaseId);
    // Querying one server-validated database id avoids the brittle client
    // listener's compound collection query and never trusts a client workspace.
    let snapshot;
    try {
      snapshot = await adminDb.collection("databaseViews").where("databaseId", "==", databaseId).get();
    } catch {
      throw new DatabaseViewRouteError("database_views_query_failed");
    }
    const views = snapshot.docs.filter((view) => view.data().workspaceId === workspaceId && view.data().type === "table").map(viewResponse).sort((left, right) => String(left.name).localeCompare(String(right.name)));
    return NextResponse.json({ success: true, views });
  } catch (error) { return failure(error); }
}

export async function POST(request: Request, context: Context) {
  try {
    const { workspaceId, databaseId } = await context.params;
    const { actor, database } = await requireDatabaseViewAccess(request, workspaceId, databaseId);
    const body = await request.json() as Record<string, unknown>;
    if (Object.keys(body).some((key) => !["name", "state"].includes(key))) return NextResponse.json({ success: false, message: "Invalid saved view." }, { status: 400 });
    const name = validateDatabaseViewName(body.name);
    const state = validateDatabaseViewState(body.state, properties(database.data()));
    if (!name || !state) return NextResponse.json({ success: false, message: "Invalid saved view." }, { status: 400 });
    const view = adminDb.collection("databaseViews").doc();
    await view.set({ name, databaseId, workspaceId, type: "table", ...state, createdBy: actor.uid, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    return NextResponse.json({ success: true, view: { id: view.id, name, databaseId, workspaceId, type: "table", ...state } }, { status: 201 });
  } catch (error) { return failure(error); }
}
