import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";
import { CustomFieldAuthError } from "@/lib/custom-field-route-auth";
import { DatabaseViewRouteError, requireDatabaseViewAccess } from "@/lib/database-view-route-auth";
import { validateDatabaseViewName, validateDatabaseViewState } from "@/lib/database-views";

type Context = { params: Promise<{ workspaceId: string; databaseId: string; viewId: string }> };

function failure(error: unknown) {
  if (error instanceof CustomFieldAuthError) return NextResponse.json({ success: false, code: error.status === 401 ? "database_views_authentication_failed" : "database_views_authorization_failed", message: error.message }, { status: error.status });
  if (error instanceof DatabaseViewRouteError) return NextResponse.json({ success: false, code: error.code, message: "Saved view could not be processed." }, { status: 500 });
  return NextResponse.json({ success: false, code: "database_views_unknown_failure", message: "Saved view could not be processed." }, { status: 500 });
}

function properties(data: Record<string, unknown> | undefined) {
  return Array.isArray(data?.properties) ? data.properties.filter((property): property is { id: string; type: string } => typeof property === "object" && property !== null && typeof (property as { id?: unknown }).id === "string" && typeof (property as { type?: unknown }).type === "string") : [];
}

export async function PATCH(request: Request, context: Context) {
  try {
    const { workspaceId, databaseId, viewId } = await context.params;
    const { database } = await requireDatabaseViewAccess(request, workspaceId, databaseId);
    const body = await request.json() as Record<string, unknown>;
    if (!Object.keys(body).length || Object.keys(body).some((key) => !["name", "state"].includes(key))) return NextResponse.json({ success: false, message: "Invalid saved view." }, { status: 400 });
    const ref = adminDb.collection("databaseViews").doc(viewId);
    const snapshot = await ref.get();
    if (!snapshot.exists || snapshot.data()?.databaseId !== databaseId || snapshot.data()?.workspaceId !== workspaceId || snapshot.data()?.type !== "table") return NextResponse.json({ success: false, message: "Saved view not found." }, { status: 404 });
    const update: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
    if (body.name !== undefined) { const name = validateDatabaseViewName(body.name); if (!name) return NextResponse.json({ success: false, message: "Invalid saved view." }, { status: 400 }); update.name = name; }
    if (body.state !== undefined) { const state = validateDatabaseViewState(body.state, properties(database.data())); if (!state) return NextResponse.json({ success: false, message: "Invalid saved view." }, { status: 400 }); Object.assign(update, state); }
    await ref.update(update);
    return NextResponse.json({ success: true });
  } catch (error) { return failure(error); }
}

export async function DELETE(request: Request, context: Context) {
  try {
    const { workspaceId, databaseId, viewId } = await context.params;
    await requireDatabaseViewAccess(request, workspaceId, databaseId);
    const ref = adminDb.collection("databaseViews").doc(viewId);
    const snapshot = await ref.get();
    if (!snapshot.exists || snapshot.data()?.databaseId !== databaseId || snapshot.data()?.workspaceId !== workspaceId || snapshot.data()?.type !== "table") return NextResponse.json({ success: false, message: "Saved view not found." }, { status: 404 });
    await ref.delete();
    return NextResponse.json({ success: true });
  } catch (error) { return failure(error); }
}
